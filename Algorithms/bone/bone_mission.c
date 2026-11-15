/*
 * mission.c  -  INTEGRATED MODEL : activity + nutrition + bone index, day by day
 *
 * Inside this single file:
 *   MODULE 1 : physical activity  (simulated accelerometer + session log -> exercise dose 0..1)
 *   MODULE 2 : nutrition          (food database + menu, NASA JSC-67378 -> nutrition penalty >= 1)
 *   MODULE 3 : bone index         BoneIndex(t) = BoneIndex_0 - (k_loss x t) + E_exercise - P_nutrition
 *
 * Output (in English): daily table from day 1 to the end of the mission, an ASCII chart of the
 * bone index with the alert levels, and an alert log (loss trend, thresholds, projection).
 *
 * Compile : gcc -O2 -Wall -Wextra -o mission mission.c -lm
 * Run     : ./mission [days] [scenario] [k_loss_percent_per_month]
 *             scenario 1 = nominal mission (default)
 *             scenario 2 = what-if : exercise and food supply degrade after day 60
 *   examples : ./mission            -> 180 days, nominal
 *              ./mission 180 2      -> 180 days, degradation after day 60
 *
 * SOURCES    : k_loss 1-1.5 %/month (NASA HRP "Hazard: Gravity Fields"); ISS exercise references
 *              (Scott et al. 2023, npj Microgravity); nutrition requirements NASA-STD JSC-67378 Rev 1.
 * HYPOTHESES : accelerometer thresholds, score weights, MAX_PROT, DOSE_TARGET, PEN_MAX,
 *              and ALL alert levels (WARN_LEVEL, RISK_LEVEL, TREND_ALERT). To be justified/calibrated.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

#define PI 3.14159265358979323846

/* ============================ MISSION SETTINGS ============================ */
#define MISSION_DAYS_DEFAULT 180
#define SCENARIO_DEFAULT     1
#define SWITCH_DAY           60       /* scenario 2 : degradation starts after this day */
#define MAX_DAYS             1000

/* ============================ BONE MODEL ============================ */
#define BONE_0          100.0         /* baseline index                                   */
#define K_LOSS_DEFAULT  1.25          /* % per month (NASA range 1.0 - 1.5)               */
#define DAYS_PER_MONTH  30.0
#define MAX_PROT        0.80          /* HYPOTHESIS : max share of loss avoidable by exercise */
#define DOSE_TARGET     1.00          /* HYPOTHESIS : dose giving the max protection          */

/* ============================ ALERT LEVELS (HYPOTHESES) ============================ */
#define WARN_LEVEL      97.0          /* index <= 97  (about 3 % loss)                    */
#define RISK_LEVEL      95.0          /* index <= 95  (about 5 % loss)                    */
#define TREND_ALERT     0.80          /* points lost over 30 days considered too fast      */

/* ============================ MODULE 1 : ACTIVITY ============================ */
#define FS            50
#define WIN_S         5
#define WIN           (FS * WIN_S)
#define WINS_PER_MIN  (60 / WIN_S)
#define DAYS_WEEK     7
#define MONITOR_MIN   150             /* simulated minutes per day (enough for exercise detection) */
#define LIGHT_MIN     30

#define THR_REST      0.02            /* HYPOTHESIS : dynamic RMS in g */
#define THR_LIGHT     0.15
#define THR_FREQ      1.2             /* Hz : below = resistance, above = aerobic */

#define REF_MIN_WEEK  600.0           /* ISS median exercise minutes per week */
#define REF_RES_DAYS  3.0             /* resistance days per week (Sprint protocol) */
#define W_TIME        0.4             /* HYPOTHESIS : weights of the dose score */
#define W_DAYS        0.3
#define W_LOAD        0.3

typedef enum { C_REST = 0, C_LIGHT, C_RESIST, C_AERO, NB_CLASSES } Activity;

typedef struct { const char *name; double ref_kg; } RefLoad;
static const RefLoad REF_LOADS[] = {          /* ISS median loads (lb converted to kg) */
    { "squat", 82.0 }, { "deadlift", 87.0 }, { "mollets", 108.0 }, { "developpe", 55.0 }
};
#define NB_REF_LOADS ((int)(sizeof(REF_LOADS) / sizeof(REF_LOADS[0])))

typedef struct {
    int    day;
    char   type;                  /* 'R' resistance, 'A' aerobic */
    char   exo[32];
    double load_kg;
    int    sets, reps, minutes;
} Session;

typedef struct {
    int    exercise_min;          /* detected by the accelerometer (week) */
    int    res_days;
    double time_score, days_score, load_score;
    double dose;                  /* 0..1 */
} DoseReport;

/* --- Weekly plans (minutes per day, days 1..7) and matching session logs --- */
static const int PLAN_A_RES[DAYS_WEEK]  = { 40, 40, 40, 40, 40, 40, 0 };
static const int PLAN_A_AERO[DAYS_WEEK] = { 50, 50, 50, 50, 50, 50, 0 };
static const char *LOG_A[] = {
    "1,R,squat,85,3,10,15",  "1,R,deadlift,80,3,10,15", "1,R,mollets,100,3,15,10",  "1,A,tapis,0,0,0,50",
    "2,R,squat,85,3,10,15",  "2,R,deadlift,82,3,10,15", "2,R,mollets,105,3,15,10",  "2,A,velo,0,0,0,50",
    "3,R,squat,88,3,10,15",  "3,R,deadlift,80,3,10,15", "3,R,developpe,50,3,10,10", "3,A,tapis,0,0,0,50",
    "4,R,squat,85,3,10,15",  "4,R,deadlift,85,3,10,15", "4,R,mollets,100,3,15,10",  "4,A,velo,0,0,0,50",
    "5,R,squat,90,3,10,15",  "5,R,deadlift,80,3,10,15", "5,R,developpe,52,3,10,10", "5,A,tapis,0,0,0,50",
    "6,R,squat,85,3,10,15",  "6,R,deadlift,82,3,10,15", "6,R,mollets,105,3,15,10",  "6,A,velo,0,0,0,50"
};
#define NB_LOG_A ((int)(sizeof(LOG_A) / sizeof(LOG_A[0])))

static const int PLAN_B_RES[DAYS_WEEK]  = { 20, 0, 0, 20, 0, 0, 0 };     /* degraded plan */
static const int PLAN_B_AERO[DAYS_WEEK] = { 0, 25, 25, 0, 25, 0, 0 };
static const char *LOG_B[] = {
    "1,R,squat,60,3,10,10", "1,R,mollets,70,3,15,10", "4,R,squat,60,3,10,10", "4,R,mollets,70,3,15,10",
    "2,A,velo,0,0,0,25",    "3,A,tapis,0,0,0,25",     "5,A,velo,0,0,0,25"
};
#define NB_LOG_B ((int)(sizeof(LOG_B) / sizeof(LOG_B[0])))

static double gauss(void)
{
    double u1 = (rand() + 1.0) / (RAND_MAX + 2.0);
    double u2 = (rand() + 1.0) / (RAND_MAX + 2.0);
    return sqrt(-2.0 * log(u1)) * cos(2.0 * PI * u2);
}

/* In microgravity an accelerometer at rest reads ~0 g (no 1 g offset). */
static void sample(Activity a, double t, double *ax, double *ay, double *az)
{
    double noise, amp, f;
    switch (a) {
    case C_REST:   noise = 0.005; amp = 0.00; f = 0.0; break;
    case C_LIGHT:  noise = 0.020; amp = 0.05; f = 0.5; break;
    case C_RESIST: noise = 0.020; amp = 0.60; f = 0.4; break;   /* e.g. ARED */
    default:       noise = 0.030; amp = 0.90; f = 2.5; break;   /* treadmill */
    }
    double s = amp * sin(2.0 * PI * f * t);
    *ax = s       + noise * gauss();
    *ay = 0.3 * s + noise * gauss();
    *az = 0.1 * s + noise * gauss();
}

/* One 5-second window -> class. Removing the mean = simple high-pass filter (works at 0 g and 1 g). */
static Activity classify_window(double w[3][WIN])
{
    double mean[3], var[3];
    int k, i;

    for (k = 0; k < 3; k++) {
        double s = 0.0, v = 0.0;
        for (i = 0; i < WIN; i++) s += w[k][i];
        mean[k] = s / WIN;
        for (i = 0; i < WIN; i++) { double d = w[k][i] - mean[k]; v += d * d; }
        var[k] = v / WIN;
    }
    double rms = sqrt(var[0] + var[1] + var[2]);          /* dynamic acceleration (g) */

    int ka = 0;                                            /* most active axis */
    for (k = 1; k < 3; k++) if (var[k] > var[ka]) ka = k;
    double h = 0.3 * sqrt(var[ka]);                        /* hysteresis */
    int state = 0, flips = 0;
    for (i = 0; i < WIN; i++) {
        double d = w[ka][i] - mean[ka];
        if (d > h && state != 1)        { if (state == -1) flips++; state = 1; }
        else if (d < -h && state != -1) { if (state ==  1) flips++; state = -1; }
    }
    double freq = (flips + 1) / (2.0 * WIN_S);             /* dominant frequency (Hz) */

    if (rms < THR_REST)  return C_REST;
    if (rms < THR_LIGHT) return C_LIGHT;
    return (freq < THR_FREQ) ? C_RESIST : C_AERO;
}

static int parse_session(const char *line, Session *s)
{
    if (line[0] == '#' || line[0] == '\n' || line[0] == '\0') return 0;
    return sscanf(line, "%d,%c,%31[^,],%lf,%d,%d,%d",
                  &s->day, &s->type, s->exo, &s->load_kg, &s->sets, &s->reps, &s->minutes) == 7
           && s->day >= 1 && s->day <= DAYS_WEEK;
}

static double ref_load(const char *exo)
{
    for (int i = 0; i < NB_REF_LOADS; i++)
        if (strcmp(exo, REF_LOADS[i].name) == 0) return REF_LOADS[i].ref_kg;
    return 0.0;
}

static double min1(double x) { return x > 1.0 ? 1.0 : x; }

static DoseReport compute_dose(const int plan_res[DAYS_WEEK], const int plan_aero[DAYS_WEEK],
                               const char *log[], int nlog)
{
    static double w[3][WIN];
    int win_count[NB_CLASSES] = { 0 };
    DoseReport r;
    int d, i;

    srand(42);                                              /* reproducible results */
    for (d = 0; d < DAYS_WEEK; d++) {
        int n_res   = plan_res[d]  * WINS_PER_MIN;
        int n_aero  = plan_aero[d] * WINS_PER_MIN;
        int n_light = LIGHT_MIN    * WINS_PER_MIN;
        int n_total = MONITOR_MIN  * WINS_PER_MIN;
        for (int wnd = 0; wnd < n_total; wnd++) {
            Activity truth;
            if (wnd < n_res)                         truth = C_RESIST;
            else if (wnd < n_res + n_aero)           truth = C_AERO;
            else if (wnd < n_res + n_aero + n_light) truth = C_LIGHT;
            else                                     truth = C_REST;
            for (i = 0; i < WIN; i++)
                sample(truth, (double)i / FS, &w[0][i], &w[1][i], &w[2][i]);
            win_count[classify_window(w)]++;
        }
    }
    r.exercise_min = (win_count[C_RESIST] + win_count[C_AERO]) / WINS_PER_MIN;

    int res_day[DAYS_WEEK + 1] = { 0 };
    double sum_ratio = 0.0, sum_reps = 0.0;
    for (i = 0; i < nlog; i++) {
        Session s;
        if (!parse_session(log[i], &s) || s.type != 'R') continue;
        res_day[s.day] = 1;
        double ref = ref_load(s.exo);
        if (ref > 0.0) {
            sum_ratio += min1(s.load_kg / ref) * s.sets * s.reps;
            sum_reps  += (double)s.sets * s.reps;
        }
    }
    r.res_days = 0;
    for (d = 1; d <= DAYS_WEEK; d++) r.res_days += res_day[d];

    r.time_score = min1(r.exercise_min / REF_MIN_WEEK);
    r.days_score = min1(r.res_days / REF_RES_DAYS);
    r.load_score = (sum_reps > 0.0) ? sum_ratio / sum_reps : 0.0;
    r.dose = W_TIME * r.time_score + W_DAYS * r.days_score + W_LOAD * r.load_score;
    return r;
}

/* ============================ MODULE 2 : NUTRITION ============================ */
/* NASA-STD JSC-67378 Rev 1 requirements */
#define PROT_MIN_KGKG  1.2
#define PROT_MAX_KGKG  1.8
#define CA_MIN         1000.0
#define CA_MAX         2500.0
#define VITD_MIN       1000.0
#define NA_MIN         1500.0
#define NA_MAX         2300.0
#define WATER_ML_KG    32.0
#define WATER_MIN_M    2500.0
#define WATER_MIN_F    2100.0
#define EVA_KCAL_H     200.0

/* HYPOTHESES : score weights and maximum penalty */
#define W_ENERGY 0.35
#define W_CA     0.20
#define W_VITD   0.20
#define W_PROT   0.15
#define W_NA     0.05
#define W_WATER  0.05
#define PEN_MAX  0.50                 /* penalty goes from 1.00 (perfect) to 1.50 (very poor) */

/* Astronaut profile (default = mean of the ISS astronauts studied) */
#define PROFILE_SEX    'M'
#define PROFILE_AGE    46.0
#define PROFILE_HEIGHT 1.76
#define PROFILE_MASS   79.0
#define PROFILE_PA     1.25
#define PROFILE_EVA_H  0.0

typedef struct { char name[32]; double kcal, prot, ca, vitd, na, carb, fat, water; } Food;
typedef struct { double kcal, need_kcal, prot, ca, vitd, na, water, score, penalty; } NutriReport;

/* Example food values per portion : approximate, replace with the official NASA/ISS food list.
 * name,kcal,protein_g,calcium_mg,vitD_IU,sodium_mg,carb_g,fat_g,water_mL */
static const char *FOODS[] = {
    "Cereales_lait,250,10,300,100,250,45,4,200",   "Oeufs_brouilles,150,10,60,80,150,2,11,80",
    "Poulet_riz,450,30,40,0,600,55,10,150",        "Saumon_legumes,400,28,40,400,350,10,24,150",
    "Yaourt,150,8,300,0,110,17,5,120",             "Fromage,110,7,200,10,180,1,9,10",
    "Lentilles_riz,400,18,60,0,300,70,5,200",      "Laitue_salade,30,2,40,0,30,5,1,80",
    "Pain_complet,200,8,50,0,380,36,3,20",         "Barre_proteinee,220,15,100,0,150,22,8,5",
    "Biscuits,200,3,20,0,150,28,9,0",              "Fruits_secs,160,2,40,0,5,40,1,20",
    "Supplement_vitD_1000UI,0,0,0,1000,0,0,0,0",   "Eau_500mL,0,0,0,0,0,0,0,500"
};
#define NB_FOODS ((int)(sizeof(FOODS) / sizeof(FOODS[0])))

static const char *MENU_A[] = {                   /* nominal menu */
    "Cereales_lait,1.0", "Oeufs_brouilles,1.0", "Poulet_riz,1.0", "Saumon_legumes,0.5",
    "Yaourt,1.0", "Pain_complet,1.0", "Barre_proteinee,1.0", "Lentilles_riz,1.0",
    "Laitue_salade,1.0", "Biscuits,1.0", "Fruits_secs,1.0", "Eau_500mL,4"
};
#define NB_MENU_A ((int)(sizeof(MENU_A) / sizeof(MENU_A[0])))

static const char *MENU_B[] = {                   /* degraded menu (food supply shortage) */
    "Cereales_lait,1.0", "Poulet_riz,1.0", "Pain_complet,1.0", "Barre_proteinee,1.0",
    "Lentilles_riz,0.5", "Biscuits,1.0", "Yaourt,1.0", "Eau_500mL,3"
};
#define NB_MENU_B ((int)(sizeof(MENU_B) / sizeof(MENU_B[0])))

static double score_min(double v, double mn) { return v >= mn ? 1.0 : v / mn; }

static double score_range(double v, double mn, double mx)
{
    if (v < mn)  return v / mn;
    if (v <= mx) return 1.0;
    double s = 1.0 - (v - mx) / mx;
    return s < 0.0 ? 0.0 : s;
}

static double score_energy(double ratio)
{
    if (ratio < 1.0)   return ratio;
    if (ratio <= 1.15) return 1.0;
    double s = 1.0 - (ratio - 1.15);
    return s < 0.0 ? 0.0 : s;
}

static NutriReport compute_nutrition(const char *menu[], int nmenu)
{
    static Food foods[32];
    int nf = 0, i;
    NutriReport r;
    double tk = 0, tp = 0, tc = 0, td = 0, tn = 0, tw = 0;

    for (i = 0; i < NB_FOODS && nf < 32; i++) {
        Food f;
        if (sscanf(FOODS[i], "%31[^,],%lf,%lf,%lf,%lf,%lf,%lf,%lf,%lf",
                   f.name, &f.kcal, &f.prot, &f.ca, &f.vitd, &f.na, &f.carb, &f.fat, &f.water) == 9)
            foods[nf++] = f;
    }
    for (i = 0; i < nmenu; i++) {
        char name[32];
        double frac;
        if (sscanf(menu[i], "%31[^,],%lf", name, &frac) != 2) continue;
        for (int j = 0; j < nf; j++) {
            if (strcmp(foods[j].name, name) == 0) {
                tk += foods[j].kcal * frac;  tp += foods[j].prot * frac;
                tc += foods[j].ca   * frac;  td += foods[j].vitd * frac;
                tn += foods[j].na   * frac;  tw += foods[j].water * frac;
                break;
            }
        }
    }

    double eer;
    if (PROFILE_SEX == 'M') eer = 622.0 - 9.53 * PROFILE_AGE + PROFILE_PA * (15.9 * PROFILE_MASS + 539.6 * PROFILE_HEIGHT);
    else                    eer = 354.0 - 6.91 * PROFILE_AGE + PROFILE_PA * (9.36 * PROFILE_MASS + 726.0 * PROFILE_HEIGHT);
    double need = eer + EVA_KCAL_H * PROFILE_EVA_H;

    double water_min = WATER_ML_KG * PROFILE_MASS;
    double floor_w = (PROFILE_SEX == 'M') ? WATER_MIN_M : WATER_MIN_F;
    if (water_min < floor_w) water_min = floor_w;

    double s_e = score_energy(tk / need);
    double s_c = score_range(tc, CA_MIN, CA_MAX);
    double s_d = score_min(td, VITD_MIN);
    double s_p = score_range(tp, PROT_MIN_KGKG * PROFILE_MASS, PROT_MAX_KGKG * PROFILE_MASS);
    double s_n = score_range(tn, NA_MIN, NA_MAX);
    double s_w = score_min(tw, water_min);

    r.kcal = tk; r.need_kcal = need; r.prot = tp; r.ca = tc; r.vitd = td; r.na = tn; r.water = tw;
    r.score = W_ENERGY * s_e + W_CA * s_c + W_VITD * s_d + W_PROT * s_p + W_NA * s_n + W_WATER * s_w;
    r.penalty = 1.0 + PEN_MAX * (1.0 - r.score);
    return r;
}

/* ============================ MODULE 3 : BONE INDEX ============================ */
typedef enum { ST_OK = 0, ST_TREND, ST_PROJ, ST_WARN, ST_RISK, NB_STATUS } Status;
static const char *STATUS_NAME[NB_STATUS] = { "OK", "TREND", "PROJ", "WARN", "RISK" };

static double protection(double dose)
{
    double r = dose / DOSE_TARGET;
    if (r > 1.0) r = 1.0;
    if (r < 0.0) r = 0.0;
    return MAX_PROT * r;
}

/* ASCII chart : index vs day, with WARN ('-') and RISK ('=') levels */
static void draw_chart(const double *bone, int days)
{
    const int COLS = 60;
    const double ymax = 100.0;
    double minb = bone[days];
    for (int d = 0; d <= days; d++) if (bone[d] < minb) minb = bone[d];
    double lowest = (minb < RISK_LEVEL) ? minb : RISK_LEVEL;
    double ymin = floor((lowest - 0.5) * 2.0) / 2.0;
    int rows = (int)((ymax - ymin) / 0.5 + 0.5) + 1;
    int warn_row = (int)((ymax - WARN_LEVEL) / 0.5 + 0.5);
    int risk_row = (int)((ymax - RISK_LEVEL) / 0.5 + 0.5);

    for (int r = 0; r < rows; r++) {
        printf("%6.1f |", ymax - 0.5 * r);
        for (int c = 0; c < COLS; c++) {
            int d = (int)((double)c * days / (COLS - 1) + 0.5);
            int data_row = (int)((ymax - bone[d]) / 0.5 + 0.5);
            char ch = ' ';
            if (r == warn_row) ch = '-';
            if (r == risk_row) ch = '=';
            if (r == data_row) ch = '*';
            putchar(ch);
        }
        if (r == warn_row) printf("  WARN level (%.0f)", WARN_LEVEL);
        if (r == risk_row) printf("  RISK level (%.0f)", RISK_LEVEL);
        putchar('\n');
    }
    printf("       +");
    for (int c = 0; c < COLS; c++) putchar('-');
    putchar('\n');

    char axis[128];
    memset(axis, ' ', sizeof axis);
    axis[127] = '\0';
    int ticks[4] = { 0, days / 3, (2 * days) / 3, days };
    for (int k = 0; k < 4; k++) {
        char lab[16];
        int col = (int)((double)ticks[k] * (COLS - 1) / days + 0.5);
        int n = snprintf(lab, sizeof lab, "%d", ticks[k]);
        if (n > 0 && 8 + col + n < 126) memcpy(axis + 8 + col, lab, (size_t)n);
    }
    for (int i = 126; i >= 0; i--) { if (axis[i] != ' ') break; axis[i] = '\0'; }
    printf("%s   (day)\n", axis);
}

/* ============================ MAIN ============================ */
int main(int argc, char **argv)
{
    int days = MISSION_DAYS_DEFAULT, scenario = SCENARIO_DEFAULT;
    double k_month = K_LOSS_DEFAULT;

    if (argc > 1) days     = atoi(argv[1]);
    if (argc > 2) scenario = atoi(argv[2]);
    if (argc > 3) k_month  = atof(argv[3]);
    if (days < 30) days = 30;
    if (days > MAX_DAYS) days = MAX_DAYS;
    if (scenario != 2) scenario = 1;
    if (k_month < 0.1) k_month = K_LOSS_DEFAULT;

    /* ---- Modules 1 and 2 ---- */
    DoseReport  doseA = compute_dose(PLAN_A_RES, PLAN_A_AERO, LOG_A, NB_LOG_A);
    NutriReport nutA  = compute_nutrition(MENU_A, NB_MENU_A);
    DoseReport  doseB = doseA;
    NutriReport nutB  = nutA;
    if (scenario == 2) {
        doseB = compute_dose(PLAN_B_RES, PLAN_B_AERO, LOG_B, NB_LOG_B);
        nutB  = compute_nutrition(MENU_B, NB_MENU_B);
    }

    printf("=== MISSION BONE MODEL : activity + nutrition + bone index ===\n\n");
    printf("BoneIndex(t) = BoneIndex_0 - (k_loss x t) + E_exercise - P_nutrition\n\n");
    printf("Mission length : %d days   |   k_loss : %.2f %%/month   |   Scenario %d (%s)\n\n",
           days, k_month, scenario, scenario == 1 ? "nominal" : "degradation after day 60");

    printf("MODULE 1 - PHYSICAL ACTIVITY (accelerometer + session log)\n");
    printf("  Plan A : %d min/week, %d resistance days, load %.0f%% of ISS medians -> exercise dose %.2f\n",
           doseA.exercise_min, doseA.res_days, 100.0 * doseA.load_score, doseA.dose);
    if (scenario == 2)
        printf("  Plan B : %d min/week, %d resistance days, load %.0f%% of ISS medians -> exercise dose %.2f\n",
               doseB.exercise_min, doseB.res_days, 100.0 * doseB.load_score, doseB.dose);

    printf("MODULE 2 - NUTRITION (NASA JSC-67378)\n");
    printf("  Menu A : %.0f kcal (need %.0f), vitamin D %.0f IU, calcium %.0f mg -> nutrition score %.2f, penalty %.3f\n",
           nutA.kcal, nutA.need_kcal, nutA.vitd, nutA.ca, nutA.score, nutA.penalty);
    if (scenario == 2)
        printf("  Menu B : %.0f kcal (need %.0f), vitamin D %.0f IU, calcium %.0f mg -> nutrition score %.2f, penalty %.3f\n",
               nutB.kcal, nutB.need_kcal, nutB.vitd, nutB.ca, nutB.score, nutB.penalty);

    printf("\nALERT LEVELS (project hypotheses) : WARN <= %.0f | RISK <= %.0f | TREND > %.2f pts lost / 30 days\n\n",
           WARN_LEVEL, RISK_LEVEL, TREND_ALERT);

    /* ---- Module 3 : daily computation ---- */
    static double bone[MAX_DAYS + 1], nat[MAX_DAYS + 1], ex[MAX_DAYS + 1], pen[MAX_DAYS + 1];
    static double rate30[MAX_DAYS + 1];
    static Status status[MAX_DAYS + 1];
    double k_day = k_month / DAYS_PER_MONTH;

    bone[0] = BONE_0;
    for (int d = 1; d <= days; d++) {
        int degraded = (scenario == 2 && d > SWITCH_DAY);
        const DoseReport  *dr = degraded ? &doseB : &doseA;
        const NutriReport *nr = degraded ? &nutB  : &nutA;
        double prot = protection(dr->dose);

        nat[d]  = k_day;                                       /* natural loss rate (pts/day)        */
        ex[d]   = k_day * prot;                                /* exercise effect (pts/day)          */
        pen[d]  = k_day * (1.0 - prot) * (nr->penalty - 1.0);  /* nutrition deficiency penalty       */
        bone[d] = bone[d - 1] - nat[d] + ex[d] - pen[d];

        int ref = (d > 30) ? d - 30 : 0;
        int span = (d > 30) ? 30 : d;
        rate30[d] = (bone[ref] - bone[d]) * 30.0 / span;

        Status st = ST_OK;
        if (d >= 7 && rate30[d] > TREND_ALERT) st = ST_TREND;
        if (d >= 14) {
            double projected = bone[d] - (rate30[d] / 30.0) * (days - d);
            if (projected <= RISK_LEVEL && bone[d] > RISK_LEVEL && st < ST_PROJ) st = ST_PROJ;
        }
        if (bone[d] <= WARN_LEVEL && st < ST_WARN) st = ST_WARN;
        if (bone[d] <= RISK_LEVEL) st = ST_RISK;
        status[d] = st;
    }

    /* ---- Daily table ---- */
    printf("DAILY TABLE (all values in bone-index points)\n");
    printf("%-4s | %-10s | %-12s | %-12s | %-14s | %-9s | %-6s\n",
           "Day", "Est. bone", "Natural loss", "Exercise", "Nutrition", "Loss over", "Status");
    printf("%-4s | %-10s | %-12s | %-12s | %-14s | %-9s | %-6s\n",
           "", "index", "rate /day", "effect /day", "penalty /day", "last 30 d", "");
    printf("-----+------------+--------------+--------------+----------------+-----------+--------\n");
    printf("%4d | %10.3f | %12s | %12s | %14s | %9s | %-6s\n", 0, bone[0], "-", "-", "-", "-", "-");
    for (int d = 1; d <= days; d++)
        printf("%4d | %10.3f | %12.4f | %+12.4f | %14.4f | %9.3f | %-6s\n",
               d, bone[d], nat[d], ex[d], -pen[d], rate30[d], STATUS_NAME[status[d]]);

    /* ---- Chart ---- */
    printf("\nESTIMATED BONE INDEX OVER THE MISSION\n");
    draw_chart(bone, days);
    printf("       * estimated bone index    - WARN level    = RISK level\n");

    /* ---- Alert log ---- */
    int first[NB_STATUS] = { 0 };
    for (int d = 1; d <= days; d++)
        if (status[d] != ST_OK && first[status[d]] == 0) first[status[d]] = d;

    printf("\n--- ALERT LOG ---\n");
    int any = 0;
    if (first[ST_TREND]) { any = 1;
        printf("Day %3d  TREND : bone loss over the last 30 days is %.3f pts (limit %.2f).\n",
               first[ST_TREND], rate30[first[ST_TREND]], TREND_ALERT); }
    if (first[ST_PROJ]) { any = 1;
        printf("Day %3d  PROJ  : at the current rate the RISK level (%.0f) will be reached before the end of the mission.\n",
               first[ST_PROJ], RISK_LEVEL); }
    if (first[ST_WARN]) { any = 1;
        printf("Day %3d  WARN  : estimated bone index fell to %.2f (level %.0f).\n",
               first[ST_WARN], bone[first[ST_WARN]], WARN_LEVEL); }
    if (first[ST_RISK]) { any = 1;
        printf("Day %3d  RISK  : estimated bone index fell to %.2f (level %.0f). Contact the ground flight surgeon.\n",
               first[ST_RISK], bone[first[ST_RISK]], RISK_LEVEL); }
    if (!any) printf("No alert during the mission.\n");

    double slope = rate30[days] / 30.0;
    if (bone[days] <= RISK_LEVEL) {
        printf("Projection : RISK level already reached.\n");
    } else if (slope > 1e-9) {
        double to_risk = (bone[days] - RISK_LEVEL) / slope;
        if (to_risk > 3650.0) printf("Projection : at the final rate, the RISK level is not expected to be reached.\n");
        else printf("Projection : at the final rate, the RISK level would be reached around day %.0f (%.0f days after day %d).\n",
                    days + to_risk, to_risk, days);
    }

    /* ---- Summary ---- */
    double s_nat = 0, s_ex = 0, s_pen = 0;
    for (int d = 1; d <= days; d++) { s_nat += nat[d]; s_ex += ex[d]; s_pen += pen[d]; }
    const DoseReport  *dl = (scenario == 2 && days > SWITCH_DAY) ? &doseB : &doseA;
    const NutriReport *nl = (scenario == 2 && days > SWITCH_DAY) ? &nutB  : &nutA;

    printf("\n--- SUMMARY (day %d) ---\n", days);
    printf("Estimated bone index   : %.2f  (loss %.2f %%)\n", bone[days], BONE_0 - bone[days]);
    printf("Natural loss (total)   : -%.2f pts\n", s_nat);
    printf("Exercise effect (total): +%.2f pts\n", s_ex);
    printf("Nutrition penalty      : -%.2f pts\n", s_pen);
    printf("Check : %.0f - %.2f + %.2f - %.2f = %.2f\n", BONE_0, s_nat, s_ex, s_pen, BONE_0 - s_nat + s_ex - s_pen);

    printf("\n--- RECOMMENDATIONS ---\n");
    int rec = 0;
    if (dl->dose < 0.80) { rec = 1;
        printf("- Exercise: dose %.2f is low. Add resistance days, heavier loads and weekly minutes (ISS: ~600 min/week).\n", dl->dose); }
    if (nl->penalty > 1.05) { rec = 1;
        printf("- Nutrition: penalty %.3f. Fix the energy deficit (%.0f of %.0f kcal), calcium and vitamin D.\n",
               nl->penalty, nl->kcal, nl->need_kcal); }
    if (!rec) printf("- Keep the current exercise and nutrition routine.\n");

    printf("\nNOTE: estimate from a model, not a bone-density measurement (DXA).\n");
    printf("Alert levels, MAX_PROT and score weights are project hypotheses to be calibrated.\n");

    FILE *out = fopen("bone_daily.csv", "w");
    if (out) {
        fprintf(out, "day,bone_index,natural_loss,exercise_effect,nutrition_penalty,loss_30d,status\n");
        for (int d = 1; d <= days; d++)
            fprintf(out, "%d,%.4f,%.5f,%.5f,%.5f,%.4f,%s\n",
                    d, bone[d], nat[d], ex[d], pen[d], rate30[d], STATUS_NAME[status[d]]);
        fclose(out);
    }
    return 0;
}