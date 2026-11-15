/*
 * muscle_mission.c - INTEGRATED MUSCLE MODEL with anomaly detection, day by day
 *
 *   MODULE 1 : physical activity (simulated accelerometer + session log -> protection per muscle group)
 *   MODULE 2 : nutrition (food database + menus, 11 nutrients -> muscle nutrition deficiency)
 *   MODULE 3 : muscle index per group (legs, back, calves, upper body) and global muscle index
 *                 Index_g(t) = Index_g(t-1) * exp( -k_g * (1 - Prot_g(t)) * (1 + Def(t)) )
 *   MODULE 4 : anomaly engine (27 checks: index, trend, projection, sudden change, imbalance,
 *              exercise, nutrition, and measured strength versus model)
 *
 * Output (English): daily table, ASCII chart, alert log, anomaly summary, recommendations,
 * and muscle_daily.csv.
 *
 * Compile : gcc -O2 -Wall -Wextra -o muscle muscle_mission.c -lm
 * Run     : ./muscle [days] [scenario]
 *             scenario 1 = nominal mission
 *             scenario 2 = exercise and food supply degrade after day 60
 *             scenario 3 = stress test (default): ARED failure, food crisis, hidden event
 *   examples: ./muscle            -> 180 days, scenario 3
 *             ./muscle 180 1      -> 180 days, nominal
 *
 * HYPOTHESES (to justify and calibrate with NASA/ESA data): k per group, MAX_PROT, score weights,
 * accelerometer thresholds, ALL alert levels, food values, simulated strength test.
 * References to check: ISS exercise (Scott et al. 2023), NASA-STD-3001 / JSC-67378 nutrition.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

#define PI 3.14159265358979323846

/* ============================ MISSION SETTINGS ============================ */
#define MISSION_DAYS_DEFAULT 180
#define SCENARIO_DEFAULT     3
#define MAX_DAYS             600
#define MAX_SESSIONS         4096

#define SWITCH_DAY           60       /* scenario 2: degradation after this day            */
#define FAIL_FROM            40       /* scenario 3: ARED failure (no resistance training) */
#define FAIL_TO              49
#define CRISIS_FROM          90       /* scenario 3: food supply crisis                    */
#define CRISIS_TO            104
#define HIDDEN_DAY           120      /* scenario 3: hidden event (illness / injury)       */
#define HIDDEN_DROP          6.0      /* real strength loss (points), invisible to the model */

/* ============================ MUSCLE MODEL (HYPOTHESES) ============================ */
#define BASE_INDEX    100.0
#define MAX_PROT      0.70            /* max share of the loss avoidable by exercise */
#define PEN_MAX       0.50            /* max increase of the loss rate by poor nutrition */

enum { G_LEGS = 0, G_BACK, G_CALVES, G_UPPER, NG };
static const char  *G_NAME[NG]   = { "Legs", "Back", "Calves", "Upper" };
static const double G_REF_KG[NG] = { 82.0, 87.0, 108.0, 55.0 };   /* ISS median loads (kg)  */
static const double G_WEIGHT[NG] = { 0.30, 0.30, 0.25, 0.15 };    /* weight in global index */
static const double K_DAY[NG]    = { 0.0018, 0.0014, 0.0025, 0.0008 }; /* natural loss /day */

/* ============================ ALERT LEVELS (HYPOTHESES) ============================ */
#define WARN_LEVEL    90.0            /* index <= 90                                   */
#define RISK_LEVEL    85.0            /* index <= 85                                   */
#define TREND_ALERT   2.0             /* points lost over 30 days considered too fast  */
#define IMBALANCE_PTS 6.0             /* gap between best and worst muscle group       */
#define RATE_JUMP     1.3             /* today's loss rate vs mean of the last 7 days  */
#define MEAS_PERIOD   7               /* strength test every 7 days                    */
#define MEAS_NOISE    0.6             /* measurement noise (points)                    */
#define MEAS_WARN    (-2.0)           /* measured - model                              */
#define MEAS_CRIT    (-4.0)

/* ============================ MODULE 1 : ACTIVITY ============================ */
#define FS            50
#define WIN_S         5
#define WIN           (FS * WIN_S)
#define WINS_PER_MIN  (60 / WIN_S)
#define MONITOR_MIN   150
#define LIGHT_MIN     30
#define THR_REST      0.02            /* HYPOTHESIS: dynamic RMS (g) */
#define THR_LIGHT     0.15
#define THR_FREQ      1.2             /* Hz: below = resistance      */

#define WINDOW_DAYS   7
#define REF_MIN_WEEK  600.0           /* ISS median exercise minutes per week */
#define REF_MIN_LOW   450.0
#define REF_RES_DAYS  3.0
#define REF_WEEK_REPS 90.0            /* HYPOTHESIS: weekly reps per group    */
#define W_TIME        0.25
#define W_DAYS        0.25
#define W_LOAD        0.50

typedef enum { C_REST = 0, C_LIGHT, C_RESIST, C_AERO, NB_CLASSES } Activity;

typedef struct {
    int    day;
    char   type;                      /* 'R' resistance, 'A' aerobic */
    char   exo[32];
    double load_kg;
    int    sets, reps, minutes;
} Session;

typedef struct { const char *exo; int group; } ExoMap;
static const ExoMap EXO[] = {
    { "squat", G_LEGS }, { "deadlift", G_BACK }, { "calf_raise", G_CALVES }, { "bench_press", G_UPPER }
};
#define NB_EXO ((int)(sizeof(EXO) / sizeof(EXO[0])))

/* ============================ MODULE 2 : NUTRITION ============================ */
#define N_NUT 11
enum { N_ENERGY, N_PROTEIN, N_CALCIUM, N_VITD, N_VITK, N_MG, N_K, N_OMEGA3, N_FLUID, N_SODIUM, N_PHOS };

#define PROFILE_MALE   1
#define PROFILE_KG     79.0
#define PROFILE_CM     176.0
#define PROFILE_AGE    46.0
#define PROFILE_FACTOR 1.6            /* HYPOTHESIS: BMR multiplier incl. exercise */
#define SMOOTH_MUSCLE  3              /* days the muscle "remembers" the diet      */

/* Food values per serving: APPROXIMATE examples, replace with the official NASA/USDA data.
   order: kcal, protein g, calcium mg, vit D IU, vit K ug, Mg mg, K mg, omega-3 g, fluid mL, Na mg, P mg */
static const double FOOD[][N_NUT] = {
    { 180, 12,  60,  90,   1,  12, 150, 0.1,  60, 200, 200 },   /*  0 scrambled eggs   */
    { 250,  9, 200, 100,   1,  60, 300, 0.1, 150, 150, 250 },   /*  1 oatmeal + milk   */
    { 110,  1, 120, 100,   0,  25, 450, 0.0, 250,  10,  40 },   /*  2 fortified juice  */
    { 350, 22,  30,   5,   2,  40, 400, 0.1,  80, 400, 220 },   /*  3 beef and rice    */
    { 380, 24,  40,   5,   3,  45, 350, 0.1,  80, 350, 230 },   /*  4 chicken pasta    */
    { 210, 22,  15, 400,   0,  30, 400, 1.8,   0, 350, 250 },   /*  5 salmon           */
    { 330, 11,  60,   0,   1,  50, 250, 0.0,   0, 300, 180 },   /*  6 tortilla + PB    */
    {  95,  7, 160,   0, 330, 115, 900, 0.2,  80, 130, 150 },   /*  7 greens           */
    { 150,  8, 280,  80,   0,  30, 380, 0.0,   0, 100, 220 },   /*  8 yogurt           */
    { 160,  6,  75,   0,   0,  77, 200, 0.0,   0,   0, 135 },   /*  9 almonds          */
    { 250,  4,  50,   0,   0,  40, 150, 0.0,   0, 150, 100 },   /* 10 energy bar       */
    { 120,  8, 300, 120,   0,  24, 370, 0.0, 250, 105, 230 },   /* 11 milk drink       */
    {   0,  0,   0,   0,   0,   0,   0, 0.0, 250,   0,   0 },   /* 12 water 250 mL     */
    {   0,  0,   0, 600,   0,   0,   0, 0.0,   0,   0,   0 },   /* 13 vitamin D pill   */
    {  10,  0,   0,   0,   0,   0,   0, 1.0,   0,   0,   0 }    /* 14 omega-3 capsule  */
};
/* menus: food index, servings (food 4 = chicken on odd days, salmon on even days) */
static const double MENU_A[][2] = {
    {0,1},{1,1},{2,1},{3,1},{6,1},{7,1},{8,1},{9,2},{10,2},{4,1},{11,1},{12,4},{13,1},{14,1}
};
static const double MENU_DEG[][2] = {            /* food supply shortage, no supplements */
    {0,1},{1,1},{6,1},{3,1},{8,1},{9,2},{10,1},{11,1},{12,3}
};
#define NB_MENU_A   ((int)(sizeof(MENU_A) / sizeof(MENU_A[0])))
#define NB_MENU_DEG ((int)(sizeof(MENU_DEG) / sizeof(MENU_DEG[0])))

/* How much each nutrient counts for MUSCLE (sum = 1) */
static const double W_MUSCLE[N_NUT] = { 0.24, 0.36, 0.04, 0.10, 0.00, 0.08, 0.04, 0.06, 0.06, 0.02, 0.00 };

/* ============================ ALERTS ============================ */
enum {
    A_IDX_WARN, A_IDX_RISK,
    A_GRP_LEGS, A_GRP_BACK, A_GRP_CALVES, A_GRP_UPPER,
    A_TREND, A_PROJ, A_RATE, A_IMBAL,
    A_NORES2, A_NOREST, A_EXTIME,
    A_UT_LEGS, A_UT_BACK, A_UT_CALVES, A_UT_UPPER,
    A_LOAD, A_MISMATCH, A_UNLOGGED,
    A_PROTEIN, A_ENERGY, A_SURPLUS, A_VITD, A_FLUID, A_NUTDROP,
    A_MEAS_WARN, A_MEAS_CRIT,
    NB_ALERTS
};

typedef struct { const char *cat; int sev; const char *label; const char *advice; } AlertInfo;
static const AlertInfo AI[NB_ALERTS] = {
    [A_IDX_WARN]   = { "INDEX",     1, "Global muscle index at WARN level",
                       "Review the exercise and nutrition plan with the flight surgeon." },
    [A_IDX_RISK]   = { "INDEX",     3, "Global muscle index at RISK level",
                       "Contact the ground flight surgeon: strength test and plan change needed." },
    [A_GRP_LEGS]   = { "INDEX",     2, "Legs index at RISK level",
                       "Add squat/deadlift volume and check leg load." },
    [A_GRP_BACK]   = { "INDEX",     2, "Back index at RISK level",
                       "Add deadlift or back exercises." },
    [A_GRP_CALVES] = { "INDEX",     2, "Calves (soleus) index at RISK level",
                       "Add calf raises (calves lose muscle fastest in microgravity)." },
    [A_GRP_UPPER]  = { "INDEX",     2, "Upper body index at RISK level",
                       "Add bench press / upper body sessions." },
    [A_TREND]      = { "TREND",     2, "Muscle loss over 30 days too fast",
                       "Increase resistance dose; check protein and energy intake." },
    [A_PROJ]       = { "TREND",     2, "RISK level expected before the end of the mission",
                       "Change the plan now: the current rate will not hold until the end." },
    [A_RATE]       = { "TREND",     2, "Sudden increase of the loss rate",
                       "Find what changed in the last days (training, food, health)." },
    [A_IMBAL]      = { "TREND",     1, "Imbalance between muscle groups",
                       "Rebalance training toward the weakest group." },
    [A_NORES2]     = { "EXERCISE",  2, "No resistance training for 2 days in a row",
                       "Restart resistance training (check ARED availability)." },
    [A_NOREST]     = { "EXERCISE",  1, "No rest day in the last 7 days",
                       "Plan one rest day per week to avoid overtraining." },
    [A_EXTIME]     = { "EXERCISE",  1, "Weekly exercise time below ISS range",
                       "Add minutes: ISS reference is about 600 min/week." },
    [A_UT_LEGS]    = { "EXERCISE",  1, "Legs under-trained (week)",
                       "Add squat sets or load." },
    [A_UT_BACK]    = { "EXERCISE",  1, "Back under-trained (week)",
                       "Add deadlift sets or load." },
    [A_UT_CALVES]  = { "EXERCISE",  1, "Calves under-trained (week)",
                       "Add calf raise sets." },
    [A_UT_UPPER]   = { "EXERCISE",  1, "Upper body under-trained (week)",
                       "Add bench press sets." },
    [A_LOAD]       = { "EXERCISE",  1, "Training load dropped more than 10%",
                       "Rebuild the load gradually toward the ISS medians." },
    [A_MISMATCH]   = { "EXERCISE",  1, "Accelerometer and session log do not match",
                       "Check the log entry or the sensor." },
    [A_UNLOGGED]   = { "EXERCISE",  1, "Resistance exercise detected but not logged",
                       "Complete the session log." },
    [A_PROTEIN]    = { "NUTRITION", 2, "Protein below 80% of target for 3 days",
                       "Raise protein (about 1.2 g/kg/day)." },
    [A_ENERGY]     = { "NUTRITION", 2, "Energy deficit (3-day mean under 85%)",
                       "Raise energy intake: a deficit breaks down muscle." },
    [A_SURPLUS]    = { "NUTRITION", 1, "Energy surplus (7-day mean over 115%)",
                       "Reduce intake or increase exercise." },
    [A_VITD]       = { "NUTRITION", 1, "Vitamin D below 80% of target for 7 days",
                       "Take the vitamin D supplement." },
    [A_FLUID]      = { "NUTRITION", 1, "Fluid intake under 70% of target",
                       "Drink more water." },
    [A_NUTDROP]    = { "NUTRITION", 2, "Sudden drop of nutrition quality",
                       "Check food supply and missed meals." },
    [A_MEAS_WARN]  = { "MEASURE",   2, "Measured strength below the model",
                       "Possible unmodelled problem (illness, injury, fatigue): repeat the test." },
    [A_MEAS_CRIT]  = { "MEASURE",   3, "Measured strength far below the model",
                       "Unmodelled event likely: contact the flight surgeon." }
};
static const char *SEV_NAME[4] = { "OK", "WARN", "ALERT", "CRIT" };

/* ============================ DATA OF THE RUN ============================ */
static int    DAYS, SCENARIO;
static Session logbook[MAX_SESSIONS];
static int    n_log;

static int    res_j[MAX_DAYS + 1], aero_j[MAX_DAYS + 1];       /* minutes in the log        */
static int    det_res[MAX_DAYS + 1], det_aero[MAX_DAYS + 1];   /* minutes seen by the sensor */
static double dose[MAX_DAYS + 1], prot_avg[MAX_DAYS + 1];
static double prot_g[MAX_DAYS + 1][NG];

static double target[N_NUT];
static double intake[MAX_DAYS + 1][N_NUT];
static double nut_raw[MAX_DAYS + 1], nut_smooth[MAX_DAYS + 1];

static double G[MAX_DAYS + 1][NG], idx[MAX_DAYS + 1], keff[MAX_DAYS + 1], loss30[MAX_DAYS + 1];
static double meas[MAX_DAYS + 1], resid[MAX_DAYS + 1];
static int    meas_ok[MAX_DAYS + 1];

static unsigned char act[NB_ALERTS][MAX_DAYS + 1];
static int status[MAX_DAYS + 1], n_alerts[MAX_DAYS + 1];

static double min1(double x) { return x > 1.0 ? 1.0 : x; }

static void flag(int id, int d) { act[id][d] = 1; }

static double gauss(void)
{
    double u1 = (rand() + 1.0) / (RAND_MAX + 2.0);
    double u2 = (rand() + 1.0) / (RAND_MAX + 2.0);
    return sqrt(-2.0 * log(u1)) * cos(2.0 * PI * u2);
}

/* ============================ MODULE 1 : ACTIVITY ============================ */

/* In microgravity an accelerometer at rest reads about 0 g (no 1 g offset). */
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

/* One 5 s window -> class. Removing the mean = simple high-pass filter. */
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
    double rms = sqrt(var[0] + var[1] + var[2]);
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
    if (rms < THR_REST)  return C_REST;
    if (rms < THR_LIGHT) return C_LIGHT;
    return (freq < THR_FREQ) ? C_RESIST : C_AERO;
}

/* Simulates one day of sensor data and counts the minutes of each class (cached). */
typedef struct { int res, aero, dres, daero; } CacheEntry;
static CacheEntry cache[128];
static int n_cache;

static void detect(int res, int aero, int *dres, int *daero)
{
    static double w[3][WIN];
    int count[NB_CLASSES] = { 0 };
    for (int c = 0; c < n_cache; c++)
        if (cache[c].res == res && cache[c].aero == aero) {
            *dres = cache[c].dres; *daero = cache[c].daero; return;
        }
    int n_res = res * WINS_PER_MIN, n_aero = aero * WINS_PER_MIN, n_light = LIGHT_MIN * WINS_PER_MIN;
    for (int k = 0; k < MONITOR_MIN * WINS_PER_MIN; k++) {
        Activity truth;
        if (k < n_res)                          truth = C_RESIST;
        else if (k < n_res + n_aero)            truth = C_AERO;
        else if (k < n_res + n_aero + n_light)  truth = C_LIGHT;
        else                                    truth = C_REST;
        for (int i = 0; i < WIN; i++)
            sample(truth, (double)i / FS, &w[0][i], &w[1][i], &w[2][i]);
        count[classify_window(w)]++;
    }
    *dres = count[C_RESIST] / WINS_PER_MIN;
    *daero = count[C_AERO] / WINS_PER_MIN;
    if (n_cache < 128) {
        cache[n_cache].res = res;   cache[n_cache].aero = aero;
        cache[n_cache].dres = *dres; cache[n_cache].daero = *daero;
        n_cache++;
    }
}

static void add_session(int day, char type, const char *exo, double load, int sets, int reps, int minutes)
{
    if (n_log >= MAX_SESSIONS) return;
    Session *s = &logbook[n_log++];
    memset(s, 0, sizeof *s);
    s->day = day; s->type = type;
    strcpy(s->exo, exo);
    s->load_kg = load; s->sets = sets; s->reps = reps; s->minutes = minutes;
}

/* Session log of the whole mission, according to the scenario */
static void build_log(void)
{
    n_log = 0;
    for (int d = 1; d <= DAYS; d++) {
        if (d % 7 == 0) continue;                                   /* weekly rest day */
        int degraded = (SCENARIO == 2 && d > SWITCH_DAY);
        int failure  = (SCENARIO == 3 && d >= FAIL_FROM && d <= FAIL_TO);
        if (degraded) {
            if (d % 7 == 1 || d % 7 == 4) {
                add_session(d, 'R', "squat",      60, 3, 10, 10);
                add_session(d, 'R', "calf_raise", 70, 3, 15, 10);
            }
            if (d % 7 == 2 || d % 7 == 3 || d % 7 == 5)
                add_session(d, 'A', (d % 2) ? "treadmill" : "bike", 0, 0, 0, 25);
            continue;
        }
        if (!failure) {
            add_session(d, 'R', "squat",      85 + d % 3 * 2,  3, 10, 15);
            add_session(d, 'R', "deadlift",   82 + d % 3 * 2,  3, 10, 15);
            add_session(d, 'R', "calf_raise", 105 + d % 2 * 3, 3, 15, 10);
            if (d % 2) add_session(d, 'R', "bench_press", 54,  3, 10, 10);
        }
        add_session(d, 'A', (d % 2) ? "treadmill" : "bike", 0, 0, 0, 50);
    }
}

static int exo_group(const char *exo)
{
    for (int i = 0; i < NB_EXO; i++)
        if (strcmp(exo, EXO[i].exo) == 0) return EXO[i].group;
    return -1;
}

/* Mean load relative to the ISS medians, weighted by reps (not capped) */
static double mean_rel_load(int d1, int d2)
{
    double sum = 0.0, reps = 0.0;
    for (int i = 0; i < n_log; i++) {
        if (logbook[i].type != 'R' || logbook[i].day < d1 || logbook[i].day > d2) continue;
        int g = exo_group(logbook[i].exo);
        if (g < 0) continue;
        double r = (double)logbook[i].sets * logbook[i].reps;
        sum  += r * logbook[i].load_kg / G_REF_KG[g];
        reps += r;
    }
    return (reps > 0.0) ? sum / reps : 0.0;
}

static void compute_exercise(void)
{
    for (int i = 0; i < n_log; i++) {
        if (logbook[i].type == 'R') res_j[logbook[i].day]  += logbook[i].minutes;
        if (logbook[i].type == 'A') aero_j[logbook[i].day] += logbook[i].minutes;
    }
    for (int d = 1; d <= DAYS; d++) detect(res_j[d], aero_j[d], &det_res[d], &det_aero[d]);

    for (int d = 1; d <= DAYS; d++) {
        int from = (d - WINDOW_DAYS + 1 > 1) ? d - WINDOW_DAYS + 1 : 1;
        int nd = d - from + 1;
        double scale = (double)nd / WINDOW_DAYS;
        int minutes = 0, res_days = 0, rest_days = 0;

        for (int x = from; x <= d; x++) {
            minutes += det_res[x] + det_aero[x];
            if (res_j[x] > 0) res_days++;
            if (res_j[x] + aero_j[x] == 0) rest_days++;
        }

        double vol[NG] = { 0 }, gscore[NG];
        for (int i = 0; i < n_log; i++) {
            if (logbook[i].type != 'R' || logbook[i].day < from || logbook[i].day > d) continue;
            int g = exo_group(logbook[i].exo);
            if (g >= 0) vol[g] += (double)logbook[i].sets * logbook[i].reps * logbook[i].load_kg;
        }
        double t_score = min1(minutes / (REF_MIN_WEEK * scale));
        double d_score = min1(res_days / (REF_RES_DAYS * scale));
        double load = 0.0;
        prot_avg[d] = 0.0;
        for (int g = 0; g < NG; g++) {
            gscore[g] = min1(vol[g] / (G_REF_KG[g] * REF_WEEK_REPS * scale));
            load += G_WEIGHT[g] * gscore[g];
            double dose_g = W_TIME * t_score + W_DAYS * d_score + W_LOAD * gscore[g];
            prot_g[d][g] = MAX_PROT * dose_g;                    /* protection of THIS group */
            prot_avg[d] += G_WEIGHT[g] * prot_g[d][g];
        }
        dose[d] = W_TIME * t_score + W_DAYS * d_score + W_LOAD * load;

        /* ---- exercise anomalies ---- */
        if (d >= 2 && res_j[d] == 0 && res_j[d - 1] == 0) flag(A_NORES2, d);
        if (nd == WINDOW_DAYS && rest_days == 0)          flag(A_NOREST, d);
        if (nd == WINDOW_DAYS && minutes < REF_MIN_LOW)   flag(A_EXTIME, d);
        if (nd == WINDOW_DAYS)
            for (int g = 0; g < NG; g++)
                if (gscore[g] < 0.5) flag(A_UT_LEGS + g, d);
        if (d >= 2 * WINDOW_DAYS) {
            double now  = mean_rel_load(d - WINDOW_DAYS + 1, d);
            double prev = mean_rel_load(d - 2 * WINDOW_DAYS + 1, d - WINDOW_DAYS);
            if (prev > 0.0 && now > 0.0 && now < 0.9 * prev) flag(A_LOAD, d);
        }
        if (res_j[d] > 0) {
            double gap = 100.0 * fabs((double)det_res[d] - res_j[d]) / res_j[d];
            if (gap > 20.0) flag(A_MISMATCH, d);
        } else if (det_res[d] >= 10) {
            flag(A_UNLOGGED, d);
        }
    }
}

/* ============================ MODULE 2 : NUTRITION ============================ */

static void compute_targets(void)
{
    /* Mifflin-St Jeor (HYPOTHESIS: NASA uses IOM energy equations, check) */
    double bmr = 10.0 * PROFILE_KG + 6.25 * PROFILE_CM - 5.0 * PROFILE_AGE + (PROFILE_MALE ? 5.0 : -161.0);
    target[N_ENERGY]  = bmr * PROFILE_FACTOR;
    target[N_PROTEIN] = 1.2 * PROFILE_KG;              /* HYPOTHESIS: 1.2 g/kg */
    target[N_CALCIUM] = 1200.0;
    target[N_VITD]    = 1000.0;
    target[N_VITK]    = PROFILE_MALE ? 120.0 : 90.0;
    target[N_MG]      = 350.0;
    target[N_K]       = 3400.0;
    target[N_OMEGA3]  = PROFILE_MALE ? 1.6 : 1.1;
    target[N_FLUID]   = 2000.0;
    target[N_SODIUM]  = 2300.0;                        /* upper limit */
    target[N_PHOS]    = 1.5;                           /* max phosphorus / calcium ratio */
}

/* score of ONE nutrient: 0 = fine, 1 = very bad */
static double nutrient_score(int i, const double *v)
{
    double r = v[i] / target[i];
    if (i == N_ENERGY)                                  /* too little OR too much */
        return r < 0.9 ? (0.9 - r) / 0.9 : (r > 1.15 ? 0.5 * min1((r - 1.15) / 0.5) : 0.0);
    if (i == N_SODIUM) return r <= 1.0 ? 0.0 : min1(r - 1.0);
    if (i == N_PHOS) {
        if (v[N_CALCIUM] <= 0.0) return 1.0;
        r = (v[N_PHOS] / v[N_CALCIUM]) / target[N_PHOS];
        return r <= 1.0 ? 0.0 : min1(r - 1.0);
    }
    return r >= 0.9 ? 0.0 : (0.9 - r) / 0.9;
}

static int below(int d, int n, int nut, double frac)    /* last n days all below frac*target */
{
    if (d < n) return 0;
    for (int x = d - n + 1; x <= d; x++)
        if (intake[x][nut] >= frac * target[nut]) return 0;
    return 1;
}

static double mean_ratio(int d, int n, int nut)
{
    int from = (d - n + 1 > 1) ? d - n + 1 : 1;
    double s = 0.0;
    for (int x = from; x <= d; x++) s += intake[x][nut];
    return s / (d - from + 1) / target[nut];
}

static void compute_nutrition(void)
{
    double alpha = 2.0 / (SMOOTH_MUSCLE + 1), ema = 0.0;
    compute_targets();

    for (int d = 1; d <= DAYS; d++) {
        int bad = (SCENARIO == 2 && d > SWITCH_DAY) ||
                  (SCENARIO == 3 && d >= CRISIS_FROM && d <= CRISIS_TO);
        int n = bad ? NB_MENU_DEG : NB_MENU_A;
        for (int k = 0; k < n; k++) {
            int f = bad ? (int)MENU_DEG[k][0] : (int)MENU_A[k][0];
            double s = bad ? MENU_DEG[k][1] : MENU_A[k][1];
            if (f == 4 && d % 2 == 0) f = 5;
            for (int j = 0; j < N_NUT; j++) intake[d][j] += s * FOOD[f][j];
        }

        double raw = 0.0;
        for (int i = 0; i < N_NUT; i++) raw += W_MUSCLE[i] * nutrient_score(i, intake[d]);
        double prev = ema;
        ema += alpha * (raw - ema);
        nut_raw[d] = raw;
        nut_smooth[d] = ema;

        /* ---- nutrition anomalies ---- */
        if (below(d, 3, N_PROTEIN, 0.8))                                          flag(A_PROTEIN, d);
        if (d >= 3 && mean_ratio(d, 3, N_ENERGY) < 0.85)                          flag(A_ENERGY, d);
        if (d >= 7 && mean_ratio(d, 7, N_ENERGY) > 1.15)                          flag(A_SURPLUS, d);
        if (below(d, 7, N_VITD, 0.8))                                             flag(A_VITD, d);
        if (intake[d][N_FLUID] < 0.7 * target[N_FLUID])                           flag(A_FLUID, d);
        if (raw - prev > 0.15)                                                    flag(A_NUTDROP, d);
    }
}

/* ============================ MODULE 3 : MUSCLE INDEX ============================ */

static double hidden_loss(int d)
{
    if (SCENARIO != 3 || d < HIDDEN_DAY) return 0.0;
    double r = HIDDEN_DROP * (d - HIDDEN_DAY + 1) / 5.0;
    return r > HIDDEN_DROP ? HIDDEN_DROP : r;
}

static void compute_index(void)
{
    for (int g = 0; g < NG; g++) G[0][g] = BASE_INDEX;
    idx[0] = BASE_INDEX;

    for (int d = 1; d <= DAYS; d++) {
        double def = PEN_MAX * nut_smooth[d];
        idx[d] = 0.0;
        keff[d] = 0.0;
        for (int g = 0; g < NG; g++) {
            double k = K_DAY[g] * (1.0 - prot_g[d][g]) * (1.0 + def);
            G[d][g] = G[d - 1][g] * exp(-k);
            idx[d]  += G_WEIGHT[g] * G[d][g];
            keff[d] += G_WEIGHT[g] * k;
        }
        int ref = (d > 30) ? d - 30 : 0;
        int span = (d > 30) ? 30 : d;
        loss30[d] = (idx[ref] - idx[d]) * 30.0 / span;
    }

    /* simulated weekly strength test: real value = model + hidden event + noise.
       With a real device, replace this block by the measured values. */
    for (int d = MEAS_PERIOD; d <= DAYS; d += MEAS_PERIOD) {
        meas[d] = idx[d] - hidden_loss(d) + MEAS_NOISE * gauss();
        resid[d] = meas[d] - idx[d];
        meas_ok[d] = 1;
    }
}

/* ============================ MODULE 4 : ANOMALY ENGINE ============================ */

static void detect_anomalies(void)
{
    int state = 0;                                    /* 0 none, 1 warn, 2 critical (held until next test) */
    for (int d = 1; d <= DAYS; d++) {
        /* level checks */
        if (idx[d] <= WARN_LEVEL) flag(A_IDX_WARN, d);
        if (idx[d] <= RISK_LEVEL) flag(A_IDX_RISK, d);
        double gmin = G[d][0], gmax = G[d][0];
        for (int g = 0; g < NG; g++) {
            if (G[d][g] <= RISK_LEVEL) flag(A_GRP_LEGS + g, d);
            if (G[d][g] < gmin) gmin = G[d][g];
            if (G[d][g] > gmax) gmax = G[d][g];
        }
        if (gmax - gmin > IMBALANCE_PTS) flag(A_IMBAL, d);

        /* trend and projection */
        if (d >= 7 && loss30[d] > TREND_ALERT) flag(A_TREND, d);
        if (d >= 14 && idx[d] > RISK_LEVEL) {
            double projected = idx[d] - (loss30[d] / 30.0) * (DAYS - d);
            if (projected <= RISK_LEVEL) flag(A_PROJ, d);
        }

        /* sudden change of the loss rate (today vs mean of the previous 7 days) */
        if (d > 7) {
            double m = 0.0;
            for (int i = d - 7; i < d; i++) m += keff[i];
            m /= 7.0;
            if (keff[d] > RATE_JUMP * m) flag(A_RATE, d);
        }

        /* measured strength versus model (state is held until the next test) */
        if (meas_ok[d]) {
            state = 0;
            if (resid[d] <= MEAS_CRIT)      state = 2;
            else if (resid[d] <= MEAS_WARN) state = 1;
        }
        if (state == 2) flag(A_MEAS_CRIT, d);
        if (state == 1) flag(A_MEAS_WARN, d);

        /* status of the day = highest severity */
        int sev = 0, cnt = 0;
        for (int a = 0; a < NB_ALERTS; a++)
            if (act[a][d]) { cnt++; if (AI[a].sev > sev) sev = AI[a].sev; }
        status[d] = sev;
        n_alerts[d] = cnt;
    }
}

/* ============================ OUTPUT ============================ */

static void draw_chart(void)
{
    const int COLS = 70, ROWS = 25;
    const double ymax = 100.0;
    double lo = RISK_LEVEL;
    for (int d = 0; d <= DAYS; d++) {
        if (idx[d] < lo) lo = idx[d];
        if (meas_ok[d] && meas[d] < lo) lo = meas[d];
    }
    double ymin = floor(lo - 1.0);
    double step = (ymax - ymin) / (ROWS - 1);
    int warn_row = (int)((ymax - WARN_LEVEL) / step + 0.5);
    int risk_row = (int)((ymax - RISK_LEVEL) / step + 0.5);

    for (int r = 0; r < ROWS; r++) {
        printf("%6.1f |", ymax - step * r);
        for (int c = 0; c < COLS; c++) {
            int d  = (int)((double)c * DAYS / (COLS - 1) + 0.5);
            int d0 = (c == 0) ? 0 : (int)((double)(c - 1) * DAYS / (COLS - 1) + 0.5) + 1;
            char ch = ' ';
            if (r == warn_row) ch = '-';
            if (r == risk_row) ch = '=';
            for (int x = d0; x <= d; x++)
                if (meas_ok[x] && (int)((ymax - meas[x]) / step + 0.5) == r) ch = 'o';
            if ((int)((ymax - idx[d]) / step + 0.5) == r) ch = '*';
            putchar(ch);
        }
        if (r == warn_row) printf("  WARN level (%.0f)", WARN_LEVEL);
        if (r == risk_row) printf("  RISK level (%.0f)", RISK_LEVEL);
        putchar('\n');
    }
    printf("       +");
    for (int c = 0; c < COLS; c++) putchar('-');
    putchar('\n');

    char axis[160];
    memset(axis, ' ', sizeof axis);
    axis[159] = '\0';
    int ticks[4] = { 0, DAYS / 3, (2 * DAYS) / 3, DAYS };
    for (int k = 0; k < 4; k++) {
        char lab[16];
        int col = (int)((double)ticks[k] * (COLS - 1) / DAYS + 0.5);
        int n = snprintf(lab, sizeof lab, "%d", ticks[k]);
        if (n > 0 && 8 + col + n < 158) memcpy(axis + 8 + col, lab, (size_t)n);
    }
    for (int i = 158; i >= 0; i--) { if (axis[i] != ' ') break; axis[i] = '\0'; }
    printf("%s   (day)\n", axis);
    printf("       * model muscle index   o measured strength test   - WARN level   = RISK level\n");
}

static void print_episodes(void)
{
    printf("\n--- ALERT LOG (each period during which an alert was active) ---\n");
    printf("%-9s %-6s %-8s %-8s %-6s %s\n", "Category", "Level", "From day", "To day", "Days", "Alert");
    int total = 0;
    for (int cat = 0; cat < 5; cat++) {
        const char *names[5] = { "INDEX", "TREND", "EXERCISE", "NUTRITION", "MEASURE" };
        for (int a = 0; a < NB_ALERTS; a++) {
            if (strcmp(AI[a].cat, names[cat]) != 0) continue;
            int d = 1;
            while (d <= DAYS) {
                if (!act[a][d]) { d++; continue; }
                int s = d;
                while (d <= DAYS && act[a][d]) d++;
                printf("%-9s %-6s %8d %8d %6d %s\n", AI[a].cat, SEV_NAME[AI[a].sev], s, d - 1, d - s, AI[a].label);
                total++;
            }
        }
    }
    if (!total) printf("No alert during the mission.\n");
}

static void print_summary(void)
{
    printf("\n--- ANOMALY SUMMARY (days with each severity) ---\n");
    int cnt[4] = { 0 };
    for (int d = 1; d <= DAYS; d++) cnt[status[d]]++;
    for (int s = 0; s < 4; s++)
        printf("%-6s : %3d days (%.0f %%)\n", SEV_NAME[s], cnt[s], 100.0 * cnt[s] / DAYS);

    printf("\nFirst day of each severity: ");
    for (int s = 1; s < 4; s++) {
        int f = 0;
        for (int d = 1; d <= DAYS && !f; d++) if (status[d] >= s) f = d;
        if (f) printf("%s day %d   ", SEV_NAME[s], f);
        else   printf("%s never   ", SEV_NAME[s]);
    }
    printf("\n");
}

static void print_recommendations(void)
{
    printf("\n--- RECOMMENDATIONS (alerts active during the last 7 days) ---\n");
    int rec = 0;
    int from = (DAYS > 7) ? DAYS - 6 : 1;
    for (int a = 0; a < NB_ALERTS; a++) {
        int on = 0;
        for (int d = from; d <= DAYS; d++) if (act[a][d]) on = 1;
        if (on) { printf("- [%s] %s: %s\n", SEV_NAME[AI[a].sev], AI[a].label, AI[a].advice); rec = 1; }
    }
    if (!rec) printf("- Keep the current exercise and nutrition routine.\n");
}

int main(int argc, char **argv)
{
    DAYS = MISSION_DAYS_DEFAULT;
    SCENARIO = SCENARIO_DEFAULT;
    if (argc > 1) DAYS     = atoi(argv[1]);
    if (argc > 2) SCENARIO = atoi(argv[2]);
    if (DAYS < 30) DAYS = 30;
    if (DAYS > MAX_DAYS) DAYS = MAX_DAYS;
    if (SCENARIO < 1 || SCENARIO > 3) SCENARIO = SCENARIO_DEFAULT;
    srand(42);

    build_log();
    compute_exercise();
    compute_nutrition();
    compute_index();
    detect_anomalies();

    const char *scen_name[4] = { "", "nominal", "degradation after day 60",
                                 "stress test: ARED failure d40-49, food crisis d90-104, hidden event d120" };
    printf("=== MUSCLE MISSION MODEL : activity + nutrition + muscle index + anomaly detection ===\n\n");
    printf("Index_g(t) = Index_g(t-1) * exp( -k_g * (1 - Prot_g) * (1 + Def) )   [g = Legs, Back, Calves, Upper]\n");
    printf("Mission length : %d days   |   Scenario %d (%s)\n\n", DAYS, SCENARIO, scen_name[SCENARIO]);
    printf("Natural loss k (/day): Legs %.4f  Back %.4f  Calves %.4f  Upper %.4f   | MAX_PROT %.2f  PEN_MAX %.2f\n",
           K_DAY[0], K_DAY[1], K_DAY[2], K_DAY[3], MAX_PROT, PEN_MAX);
    printf("Alert levels (hypotheses): WARN <= %.0f | RISK <= %.0f | TREND > %.1f pts/30 d | IMBALANCE > %.0f pts\n\n",
           WARN_LEVEL, RISK_LEVEL, TREND_ALERT, IMBALANCE_PTS);

    printf("DAILY TABLE (index in points, 100 = start; Meas = weekly strength test, simulated)\n");
    printf("%-4s | %-4s | %-4s | %-6s | %-7s | %-6s | %-6s | %-6s | %-6s | %-7s | %-6s | %-6s | %-5s | %-6s | %s\n",
           "Day", "Dose", "Prot", "NutDef", "k_eff", "Legs", "Back", "Calves", "Upper", "MUSCLE", "Loss30", "Meas", "Resid", "Status", "#Al");
    printf("-----+------+------+--------+---------+--------+--------+--------+--------+---------+--------+--------+-------+--------+----\n");
    for (int d = 1; d <= DAYS; d++) {
        char ms[16] = "-", rs[16] = "-";
        if (meas_ok[d]) { snprintf(ms, sizeof ms, "%.2f", meas[d]); snprintf(rs, sizeof rs, "%+.1f", resid[d]); }
        printf("%4d | %.2f | %.2f | %.3f  | %.5f | %6.2f | %6.2f | %6.2f | %6.2f | %7.3f | %6.3f | %6s | %5s | %-6s | %d\n",
               d, dose[d], prot_avg[d], PEN_MAX * nut_smooth[d], keff[d],
               G[d][0], G[d][1], G[d][2], G[d][3], idx[d], loss30[d], ms, rs,
               SEV_NAME[status[d]], n_alerts[d]);
    }

    printf("\nMUSCLE INDEX OVER THE MISSION\n");
    draw_chart();
    print_episodes();
    print_summary();

    printf("\n--- SUMMARY (day %d) ---\n", DAYS);
    printf("Global muscle index : %.2f  (loss %.2f points)\n", idx[DAYS], BASE_INDEX - idx[DAYS]);
    for (int g = 0; g < NG; g++)
        printf("  %-7s index    : %.2f  (loss %.2f points)\n", G_NAME[g], G[DAYS][g], BASE_INDEX - G[DAYS][g]);
    double projected = idx[DAYS] - (loss30[DAYS] / 30.0) * 30.0;
    printf("Loss over the last 30 days: %.2f points   |   index in 30 more days at this rate: %.2f\n",
           loss30[DAYS], projected);

    print_recommendations();
    printf("\nNOTE: estimate from a model, not a muscle measurement (MRI / strength test).\n");
    printf("k values, MAX_PROT, weights, food values and alert levels are project hypotheses to calibrate.\n");

    FILE *out = fopen("muscle_daily.csv", "w");
    if (out) {
        fprintf(out, "day,dose,protection,nutrition_def,k_eff,legs,back,calves,upper,muscle_index,loss_30d,measured,residual,status,n_alerts\n");
        for (int d = 1; d <= DAYS; d++) {
            fprintf(out, "%d,%.4f,%.4f,%.4f,%.6f,%.4f,%.4f,%.4f,%.4f,%.4f,%.4f,", d, dose[d], prot_avg[d],
                    PEN_MAX * nut_smooth[d], keff[d], G[d][0], G[d][1], G[d][2], G[d][3], idx[d], loss30[d]);
            if (meas_ok[d]) fprintf(out, "%.4f,%.4f,", meas[d], resid[d]);
            else            fprintf(out, ",,");
            fprintf(out, "%s,%d\n", SEV_NAME[status[d]], n_alerts[d]);
        }
        fclose(out);
    }
    return 0;
}