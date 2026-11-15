/*
 * astro_health.c - bone / muscle index for astronauts (ONE file, no CSV needed)
 *
 *   Part A: exercise protection  (accelerometer simulation + training log)
 *   Part B: nutrition deficiency (NASA-like daily targets)
 *   Part C: global index
 *           k_eff    = k * (1 - exercise_protection) * (1 + nutrition_deficiency)
 *           index(t) = index(t-1) * exp(-k_eff)        (1 step = 1 day)
 *           + alerts
 *
 * Build: gcc -O2 -o astro_health astro_health.c -lm
 * Run  : ./astro_health
 *
 * Change the values in SECTION 1 to test other scenarios.
 * HYPOTHESIS values must be calibrated and checked with NASA / ESA data.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

#define PI 3.14159265358979323846

/* ================= SECTION 1 : SETTINGS TO PLAY WITH ================= */

#define ORGAN_IS_BONE     0        /* 0 = muscle, 1 = bone */
#define N_DAYS            40       /* max 60 */

#define K_MUSCLE          0.0018   /* natural loss per day (HYPOTHESIS) */
#define K_BONE            0.0004   /* natural loss per day (HYPOTHESIS) */

/* exercise demo */
#define SKIP_RES_FROM     25       /* no resistance training from this day... */
#define SKIP_RES_TO       30       /* ...to this day (set 0 and 0 to disable) */
#define LOAD_DROP_DAY     31       /* lighter loads from this day */
#define LOAD_DROP_FACTOR  0.85     /* 0.85 = 15 % lighter */

/* nutrition demo */
#define BAD_FOOD_DAY      28       /* poor food from this day (set 999 to disable) */
static const double GOOD_FOOD[4] = { 2600, 95, 1150, 950 };  /* kcal, protein g, calcium mg, vit D IU */
static const double BAD_FOOD[4]  = { 1500, 50,  600, 300 };

/* ================= SECTION 2 : CONSTANTS ================= */

#define MAX_DAYS          60
#define MAX_SESSIONS      1024

/* accelerometer */
#define FS                50
#define WIN_S             5
#define WIN               (FS * WIN_S)
#define WIN_PER_MIN       (60 / WIN_S)
#define MONITORED_MIN     600
#define LIGHT_MIN         120
#define REST_TH           0.02     /* HYPOTHESIS: dynamic RMS (g) */
#define LIGHT_TH          0.15     /* HYPOTHESIS */
#define FREQ_TH           1.2      /* HYPOTHESIS: Hz, below = resistance */

/* exercise references (ISS values from the team's source: verify them) */
#define REF_MIN_WEEK      600.0
#define REF_MIN_LOW       450.0
#define REF_RES_DAYS      3.0
#define WINDOW_DAYS       7
#define REF_WEEK_REPS     90.0     /* HYPOTHESIS: weekly reps per muscle group */
#define W_TIME            0.25
#define W_DAYS            0.25
#define W_LOAD            0.50
#define MAX_PROTECTION    0.6

/* nutrition */
#define MAX_DEFICIENCY    0.5
static const double NUT_TARGET[4] = { 2700, 96, 1200, 1000 };
static const double NUT_WEIGHT[4] = { 0.30, 0.30, 0.20, 0.20 };

/* global alerts */
#define WINDOW            7
#define FORECAST          14
#define JUMP_RATIO        1.5

typedef enum { REST = 0, LIGHT, RESISTANCE, AEROBIC, NB_CLASSES } Activity;
typedef enum { G_LEGS = 0, G_BACK, G_CALVES, G_UPPER, NB_GROUPS } Group;

static const char  *GROUP_NAME[NB_GROUPS]   = { "Legs", "Back/hamstrings", "Calves", "Upper body" };
static const double GROUP_REF_KG[NB_GROUPS] = { 82.0, 87.0, 108.0, 55.0 };
static const double GROUP_WEIGHT[NB_GROUPS] = { 0.30, 0.30, 0.25, 0.15 };

typedef struct { const char *exo; int group; } ExoMap;
static const ExoMap EXO[] = {
    { "squat", G_LEGS }, { "deadlift", G_BACK },
    { "calf_raise", G_CALVES }, { "bench_press", G_UPPER }
};
#define NB_EXO ((int)(sizeof(EXO) / sizeof(EXO[0])))

typedef struct {
    int day;
    char type;                     /* 'R' resistance, 'A' aerobic */
    char exo[32];
    double load_kg;
    int sets, reps, minutes;
} Session;

/* results shared between the parts */
static double protection[MAX_DAYS + 1];
static double deficiency[MAX_DAYS + 1];
static char   ex_alert[MAX_DAYS + 1][300];
static double group_score[NB_GROUPS];

/* ================= PART A : EXERCISE ================= */

static double gauss(void)
{
    double u1 = (rand() + 1.0) / (RAND_MAX + 2.0);
    double u2 = (rand() + 1.0) / (RAND_MAX + 2.0);
    return sqrt(-2.0 * log(u1)) * cos(2.0 * PI * u2);
}

/* In microgravity at rest the sensor reads about 0 g */
static void sample(Activity a, double t, double *ax, double *ay, double *az)
{
    double noise, amp, f;
    switch (a) {
    case REST:       noise = 0.005; amp = 0.00; f = 0.0; break;
    case LIGHT:      noise = 0.020; amp = 0.05; f = 0.5; break;
    case RESISTANCE: noise = 0.020; amp = 0.60; f = 0.4; break;
    default:         noise = 0.030; amp = 0.90; f = 2.5; break;
    }
    double s = amp * sin(2.0 * PI * f * t);
    *ax = s       + noise * gauss();
    *ay = 0.3 * s + noise * gauss();
    *az = 0.1 * s + noise * gauss();
}

static Activity classify(double w[3][WIN])
{
    double mean[3], var[3];
    int k, i;

    for (k = 0; k < 3; k++) {
        double s = 0.0, v = 0.0;
        for (i = 0; i < WIN; i++) s += w[k][i];
        mean[k] = s / WIN;
        for (i = 0; i < WIN; i++) {
            double d = w[k][i] - mean[k];
            v += d * d;
        }
        var[k] = v / WIN;
    }
    double rms = sqrt(var[0] + var[1] + var[2]);
    if (rms < REST_TH)  return REST;
    if (rms < LIGHT_TH) return LIGHT;

    int ka = 0;
    for (k = 1; k < 3; k++) if (var[k] > var[ka]) ka = k;
    double h = 0.3 * sqrt(var[ka]);
    int state = 0, flips = 0;
    for (i = 0; i < WIN; i++) {
        double d = w[ka][i] - mean[ka];
        if (d > h && state != 1)        { if (state == -1) flips++; state = 1; }
        else if (d < -h && state != -1) { if (state ==  1) flips++; state = -1; }
    }
    double freq = (flips + 1) / (2.0 * WIN_S);
    return (freq < FREQ_TH) ? RESISTANCE : AEROBIC;
}

static void add_session(Session *tab, int *n, int day, char type, const char *exo,
                        double load, int sets, int reps, int minutes)
{
    Session *s = &tab[(*n)++];
    memset(s, 0, sizeof *s);
    s->day = day;
    s->type = type;
    strcpy(s->exo, exo);
    s->load_kg = load;
    s->sets = sets;
    s->reps = reps;
    s->minutes = minutes;
}

/* Demo training log: rest day every 7th day */
static int demo_log(Session *tab)
{
    int n = 0;
    for (int d = 1; d <= N_DAYS; d++) {
        if (d % 7 == 0) continue;
        double f = (d >= LOAD_DROP_DAY) ? LOAD_DROP_FACTOR : 1.0;
        if (d < SKIP_RES_FROM || d > SKIP_RES_TO) {
            add_session(tab, &n, d, 'R', "squat",      (85 + d % 3 * 2) * f, 3, 10, 15);
            add_session(tab, &n, d, 'R', "deadlift",   (82 + d % 3 * 2) * f, 3, 10, 15);
            add_session(tab, &n, d, 'R', "calf_raise", (105 + d % 2 * 3) * f, 3, 15, 10);
            if (d % 2) add_session(tab, &n, d, 'R', "bench_press", (52 + 2) * f, 3, 10, 10);
        }
        add_session(tab, &n, d, 'A', (d % 2) ? "treadmill" : "bike", 0, 0, 0, 50);
    }
    return n;
}

static int find_group(const char *exo)
{
    for (int i = 0; i < NB_EXO; i++)
        if (strcmp(exo, EXO[i].exo) == 0) return EXO[i].group;
    return -1;
}

static double min1(double x) { return x > 1.0 ? 1.0 : x; }

static double mean_rel_load(const Session *t, int n, int d1, int d2)
{
    double sum = 0.0, reps = 0.0;
    for (int i = 0; i < n; i++) {
        if (t[i].type != 'R' || t[i].day < d1 || t[i].day > d2) continue;
        int g = find_group(t[i].exo);
        if (g < 0) continue;
        double r = (double)t[i].sets * t[i].reps;
        sum  += r * t[i].load_kg / GROUP_REF_KG[g];
        reps += r;
    }
    return (reps > 0.0) ? sum / reps : 0.0;
}

static void compute_exercise(void)
{
    static Session log[MAX_SESSIONS];
    static double w[3][WIN];
    static int det[MAX_DAYS + 1][NB_CLASSES];
    static int res_j[MAX_DAYS + 1], aero_j[MAX_DAYS + 1];
    int ns = demo_log(log), i, d;

    for (i = 0; i < ns; i++) {
        if (log[i].type == 'R') res_j[log[i].day]  += log[i].minutes;
        if (log[i].type == 'A') aero_j[log[i].day] += log[i].minutes;
    }

    /* accelerometer simulated from the minutes of the log, then classified */
    for (d = 1; d <= N_DAYS; d++) {
        int n_res   = res_j[d]  * WIN_PER_MIN;
        int n_aero  = aero_j[d] * WIN_PER_MIN;
        int n_light = LIGHT_MIN * WIN_PER_MIN;
        int n_total = MONITORED_MIN * WIN_PER_MIN;
        for (int k = 0; k < n_total; k++) {
            Activity truth;
            if (k < n_res)                          truth = RESISTANCE;
            else if (k < n_res + n_aero)            truth = AEROBIC;
            else if (k < n_res + n_aero + n_light)  truth = LIGHT;
            else                                    truth = REST;
            for (i = 0; i < WIN; i++)
                sample(truth, (double)i / FS, &w[0][i], &w[1][i], &w[2][i]);
            det[d][classify(w)]++;
        }
        for (int c = 0; c < NB_CLASSES; c++) det[d][c] /= WIN_PER_MIN;
    }

    /* rolling 7-day dose, every day */
    for (d = 1; d <= N_DAYS; d++) {
        int from = (d - WINDOW_DAYS + 1 > 1) ? d - WINDOW_DAYS + 1 : 1;
        int nd = d - from + 1;
        double scale = (double)nd / WINDOW_DAYS;
        int minutes = 0, res_days = 0, rest_days = 0;

        for (int x = from; x <= d; x++) {
            minutes += det[x][RESISTANCE] + det[x][AEROBIC];
            if (res_j[x] > 0) res_days++;
            if (res_j[x] + aero_j[x] == 0) rest_days++;
        }

        double vol[NB_GROUPS] = { 0 };
        for (i = 0; i < ns; i++) {
            if (log[i].type != 'R' || log[i].day < from || log[i].day > d) continue;
            int g = find_group(log[i].exo);
            if (g >= 0) vol[g] += (double)log[i].sets * log[i].reps * log[i].load_kg;
        }
        double load = 0.0;
        for (int g = 0; g < NB_GROUPS; g++) {
            group_score[g] = min1(vol[g] / (GROUP_REF_KG[g] * REF_WEEK_REPS * scale));
            load += GROUP_WEIGHT[g] * group_score[g];
        }

        double dose = W_TIME * min1(minutes / (REF_MIN_WEEK * scale))
                    + W_DAYS * min1(res_days / (REF_RES_DAYS * scale))
                    + W_LOAD * load;
        protection[d] = MAX_PROTECTION * dose;

        char *msg = ex_alert[d];
        if (d >= 2 && res_j[d] == 0 && res_j[d - 1] == 0)
            strcat(msg, "no resistance for 2 days; ");
        if (nd == WINDOW_DAYS && rest_days == 0)
            strcat(msg, "no rest day in 7 days; ");
        if (nd == WINDOW_DAYS && minutes < REF_MIN_LOW)
            strcat(msg, "exercise time below ISS range; ");
        if (nd == WINDOW_DAYS)
            for (int g = 0; g < NB_GROUPS; g++)
                if (group_score[g] < 0.5) {
                    strcat(msg, GROUP_NAME[g]);
                    strcat(msg, " under-trained; ");
                }
        if (d >= 2 * WINDOW_DAYS) {
            double now  = mean_rel_load(log, ns, d - WINDOW_DAYS + 1, d);
            double prev = mean_rel_load(log, ns, d - 2 * WINDOW_DAYS + 1, d - WINDOW_DAYS);
            if (prev > 0.0 && now > 0.0 && now < 0.9 * prev)
                strcat(msg, "training load dropped more than 10%; ");
        }
        if (res_j[d] > 0) {
            double gap = 100.0 * fabs((double)det[d][RESISTANCE] - res_j[d]) / res_j[d];
            if (gap > 20.0) strcat(msg, "sensor/log mismatch; ");
        } else if (det[d][RESISTANCE] >= 10) {
            strcat(msg, "unlogged resistance exercise; ");
        }
    }
}

/* ================= PART B : NUTRITION ================= */

static void compute_nutrition(void)
{
    for (int d = 1; d <= N_DAYS; d++) {
        double v[4];
        for (int i = 0; i < 4; i++) {
            if (d >= BAD_FOOD_DAY) v[i] = BAD_FOOD[i];
            else                   v[i] = GOOD_FOOD[i] * (1.0 + 0.04 * ((d % 3) - 1));
        }
        double def = 0.0;
        for (int i = 0; i < 4; i++) {
            double shortfall = 1.0 - v[i] / NUT_TARGET[i];
            if (shortfall < 0.0) shortfall = 0.0;
            def += NUT_WEIGHT[i] * shortfall;
        }
        deficiency[d] = (def > MAX_DEFICIENCY) ? MAX_DEFICIENCY : def;
    }
}

/* ================= PART C : GLOBAL INDEX ================= */

int main(void)
{
    double k    = ORGAN_IS_BONE ? K_BONE : K_MUSCLE;
    double warn = ORGAN_IS_BONE ? 95 : 90;
    double crit = ORGAN_IS_BONE ? 90 : 80;
    static double keff[MAX_DAYS + 1], idx[MAX_DAYS + 1];
    int alerts = 0;

    if (N_DAYS > MAX_DAYS) {
        printf("N_DAYS must be <= %d\n", MAX_DAYS);
        return 1;
    }
    srand(42);
    compute_exercise();
    compute_nutrition();

    printf("Organ: %s   k = %.4f /day\n\n", ORGAN_IS_BONE ? "bone" : "muscle", k);
    printf("Day |    k   | Exercise | Nutrition |  k_eff  | Index %% | Alert\n");
    printf("----+--------+----------+-----------+---------+---------+------\n");

    double prev = 100.0;
    for (int d = 1; d <= N_DAYS; d++) {
        keff[d] = k * (1.0 - protection[d]) * (1.0 + deficiency[d]);
        idx[d] = prev * exp(-keff[d]);
        prev = idx[d];

        char msg[200] = "";
        if (d > WINDOW) {
            double mean = 0.0;
            for (int i = d - WINDOW; i < d; i++) mean += keff[i];
            mean /= WINDOW;
            if (keff[d] > JUMP_RATIO * mean)
                strcat(msg, "SUDDEN LOSS RATE INCREASE; ");
        }

        int from = (d > WINDOW) ? d - WINDOW + 1 : 1;
        double m = 0.0;
        for (int i = from; i <= d; i++) m += keff[i];
        m /= (d - from + 1);
        if (idx[d] * exp(-m * FORECAST) < crit && idx[d] >= crit)
            strcat(msg, "PROBLEM EXPECTED IN NEXT DAYS; ");

        if (idx[d] < crit)      strcat(msg, "CRITICAL LEVEL; ");
        else if (idx[d] < warn) strcat(msg, "WARNING LEVEL; ");

        if (msg[0]) alerts++;
        printf("%3d | %.4f |  %.3f   |   %.3f   | %.5f | %7.2f | %s\n",
               d, k, protection[d], deficiency[d], keff[d], idx[d], msg);
    }

    printf("\nFinal index: %.2f %%   Days with alert: %d\n", idx[N_DAYS], alerts);

    printf("\n--- Exercise alerts ---\n");
    int n_ex = 0;
    for (int d = 1; d <= N_DAYS; d++)
        if (ex_alert[d][0]) {
            printf("Day %2d: %s\n", d, ex_alert[d]);
            n_ex++;
        }
    if (n_ex == 0) printf("None\n");

    printf("\n--- Muscle group scores, last 7 days (1.00 = ISS reference) ---\n");
    for (int g = 0; g < NB_GROUPS; g++)
        printf("%-16s %.2f%s\n", GROUP_NAME[g], group_score[g],
               group_score[g] < 0.5 ? "  <-- under-trained" : "");

    printf("\nThe index is a model: calibrate k and the weights with NASA/ESA data.\n");
    return 0;
}