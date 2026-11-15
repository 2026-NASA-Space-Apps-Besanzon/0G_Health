/*
 * activity.c  -  PROGRAMME 1 : activite physique de l'astronaute
 *
 * - Simule un accelerometre porte au poignet en MICROGRAVITE (pas d'offset de 1 g)
 * - Calcule l'acceleration dynamique, classe l'activite par fenetres de 5 s
 *   (repos / leger / resistance / aerobie)
 * - Lit un journal de seances (type, charge, series, repetitions, duree)
 * - Calcule un score de "dose d'exercice" entre 0 et 1 et l'ecrit dans dose.txt
 *
 * Compilation : gcc -O2 -Wall -Wextra -o activity activity.c -lm
 * Utilisation : ./activity [journal.csv]
 *
 * ATTENTION : les valeurs marquees REF_ESSAI viennent de publications ISS/NASA.
 * Les valeurs marquees HYPOTHESE sont des choix de modelisation a calibrer et
 * a presenter comme tels.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

#define PI 3.14159265358979323846

/* ---------- Parametres du signal ---------- */
#define FS            50                 /* frequence d'echantillonnage (Hz)  */
#define WIN_S         5                  /* duree d'une fenetre (s)           */
#define WIN           (FS * WIN_S)       /* echantillons par fenetre          */
#define WIN_PAR_MIN   (60 / WIN_S)
#define JOURS         7
#define MIN_SURVEILLEES 600              /* minutes simulees par jour         */

/* ---------- HYPOTHESE : seuils de classification (a calibrer) ---------- */
#define SEUIL_REPOS   0.02               /* RMS dynamique en g                */
#define SEUIL_LEGER   0.15               /* RMS dynamique en g                */
#define SEUIL_FREQ    1.2                /* Hz : en dessous = resistance      */

/* ---------- REF_ESSAI : references ISS (Scott et al. 2023, npj Microgravity) ---------- */
#define REF_MIN_SEM   600.0              /* minutes d'exercice / semaine (mediane) */
#define REF_MIN_BAS   450.0              /* bas de la fourchette observee          */
#define REF_MIN_HAUT  720.0              /* haut de la fourchette observee         */
#define REF_JOURS_RES 3.0                /* resistance >= 3 j/sem (protocole Sprint) */

/* ---------- HYPOTHESE : poids du score de dose ---------- */
#define W_TEMPS       0.4
#define W_JOURS_RES   0.3
#define W_CHARGE      0.3

typedef enum { REPOS = 0, LEGER, RESISTANCE, AEROBIE, NB_CLASSES } Activite;

/* Charges mediane ISS en kg (181, 192, 239, 122 lb converties) */
typedef struct { const char *nom; double ref_kg; } RefCharge;
static const RefCharge REF_CHARGES[] = {
    { "squat",     82.0  },
    { "deadlift",  87.0  },
    { "mollets",   108.0 },
    { "developpe", 55.0  }
};
#define NB_REFS ((int)(sizeof(REF_CHARGES) / sizeof(REF_CHARGES[0])))

typedef struct {
    int    jour;          /* 1..7 */
    char   type;          /* 'R' resistance, 'A' aerobie */
    char   exo[32];
    double charge_kg;
    int    series, reps, minutes;
} Seance;

#define MAX_SEANCES 256

/* ====================== Generation du signal ====================== */

static double gauss(void)
{
    double u1 = (rand() + 1.0) / (RAND_MAX + 2.0);
    double u2 = (rand() + 1.0) / (RAND_MAX + 2.0);
    return sqrt(-2.0 * log(u1)) * cos(2.0 * PI * u2);
}

/* En microgravite au repos, l'accelerometre lit ~0 g (pas de 1 g de gravite). */
static void echantillon(Activite a, double t, double *ax, double *ay, double *az)
{
    double bruit, amp, f;
    switch (a) {
    case REPOS:      bruit = 0.005; amp = 0.00; f = 0.0; break;
    case LEGER:      bruit = 0.020; amp = 0.05; f = 0.5; break;
    case RESISTANCE: bruit = 0.020; amp = 0.60; f = 0.4; break;  /* ex. ARED */
    default:         bruit = 0.030; amp = 0.90; f = 2.5; break;  /* tapis T2 */
    }
    double s = amp * sin(2.0 * PI * f * t);
    *ax = s         + bruit * gauss();
    *ay = 0.3 * s   + bruit * gauss();
    *az = 0.1 * s   + bruit * gauss();
}

/* ====================== Analyse d'une fenetre ====================== */

typedef struct { double rms; double freq; } Features;

static Features analyser(double w[3][WIN])
{
    Features ft;
    double moy[3], var[3];
    int k, i;

    for (k = 0; k < 3; k++) {
        double s = 0.0;
        for (i = 0; i < WIN; i++) s += w[k][i];
        moy[k] = s / WIN;
        double v = 0.0;
        for (i = 0; i < WIN; i++) {
            double d = w[k][i] - moy[k];     /* filtre passe-haut simple : on retire la moyenne */
            v += d * d;
        }
        var[k] = v / WIN;
    }

    ft.rms = sqrt(var[0] + var[1] + var[2]);  /* acceleration dynamique (g) */

    /* frequence dominante estimee sur l'axe le plus actif (bascules avec hysteresis) */
    int ka = 0;
    for (k = 1; k < 3; k++) if (var[k] > var[ka]) ka = k;
    double h = 0.3 * sqrt(var[ka]);
    int etat = 0, bascules = 0;
    for (i = 0; i < WIN; i++) {
        double d = w[ka][i] - moy[ka];
        if (d > h && etat != 1)        { if (etat == -1) bascules++; etat = 1; }
        else if (d < -h && etat != -1) { if (etat ==  1) bascules++; etat = -1; }
    }
    ft.freq = (bascules + 1) / (2.0 * WIN_S);
    return ft;
}

static Activite classer(Features ft)
{
    if (ft.rms < SEUIL_REPOS) return REPOS;
    if (ft.rms < SEUIL_LEGER) return LEGER;
    return (ft.freq < SEUIL_FREQ) ? RESISTANCE : AEROBIE;
}

/* ====================== Journal de seances ====================== */

/* Journal d'exemple INTEGRE : utilise si journal.csv est absent
 * (utile pour les compilateurs en ligne qui n'ont pas de fichiers). */
static const char *JOURNAL_DEFAUT[] = {
    "1,R,squat,85,3,10,15",     "1,R,deadlift,80,3,10,15",  "1,R,mollets,100,3,15,10",  "1,A,tapis,0,0,0,50",
    "2,R,squat,85,3,10,15",     "2,R,deadlift,82,3,10,15",  "2,R,mollets,105,3,15,10",  "2,A,velo,0,0,0,50",
    "3,R,squat,88,3,10,15",     "3,R,deadlift,80,3,10,15",  "3,R,developpe,50,3,10,10", "3,A,tapis,0,0,0,50",
    "4,R,squat,85,3,10,15",     "4,R,deadlift,85,3,10,15",  "4,R,mollets,100,3,15,10",  "4,A,velo,0,0,0,50",
    "5,R,squat,90,3,10,15",     "5,R,deadlift,80,3,10,15",  "5,R,developpe,52,3,10,10", "5,A,tapis,0,0,0,50",
    "6,R,squat,85,3,10,15",     "6,R,deadlift,82,3,10,15",  "6,R,mollets,105,3,15,10",  "6,A,velo,0,0,0,50"
};
#define NB_JOURNAL_DEFAUT ((int)(sizeof(JOURNAL_DEFAUT) / sizeof(JOURNAL_DEFAUT[0])))

/* Lit UNE ligne "jour,type,exercice,charge,series,reps,minutes". Retourne 1 si valide. */
static int parser_ligne(const char *ligne, Seance *s)
{
    if (ligne[0] == '#' || ligne[0] == '\n' || ligne[0] == '\r') return 0;
    return sscanf(ligne, "%d,%c,%31[^,],%lf,%d,%d,%d",
                  &s->jour, &s->type, s->exo, &s->charge_kg,
                  &s->series, &s->reps, &s->minutes) == 7
           && s->jour >= 1 && s->jour <= JOURS;
}

static int lire_journal(const char *chemin, Seance *tab, int max)
{
    FILE *f = fopen(chemin, "r");
    char ligne[256];
    int n = 0;

    if (!f) return -1;
    while (fgets(ligne, sizeof ligne, f) && n < max) {
        Seance s;
        if (parser_ligne(ligne, &s)) tab[n++] = s;
    }
    fclose(f);
    return n;
}

static int journal_defaut(Seance *tab, int max)
{
    int n = 0;
    for (int i = 0; i < NB_JOURNAL_DEFAUT && n < max; i++) {
        Seance s;
        if (parser_ligne(JOURNAL_DEFAUT[i], &s)) tab[n++] = s;
    }
    return n;
}

static double charge_ref(const char *exo)
{
    for (int i = 0; i < NB_REFS; i++)
        if (strcmp(exo, REF_CHARGES[i].nom) == 0) return REF_CHARGES[i].ref_kg;
    return 0.0;
}

static double min1(double x) { return x > 1.0 ? 1.0 : x; }

/* ====================== Programme principal ====================== */

int main(int argc, char **argv)
{
    const char *chemin = (argc > 1) ? argv[1] : "journal.csv";
    static Seance journal[MAX_SEANCES];
    static double w[3][WIN];
    int min_det[JOURS][NB_CLASSES];
    int win_det[JOURS][NB_CLASSES];
    int d, c, i;

    srand(42);   /* resultats reproductibles */
    memset(win_det, 0, sizeof win_det);

    /* Planning simule : minutes de resistance et d'aerobie par jour (jour 7 = repos) */
    const int plan_res[JOURS]  = { 40, 40, 40, 40, 40, 40, 0 };
    const int plan_aero[JOURS] = { 50, 50, 50, 50, 50, 50, 0 };
    const int plan_leger = 120;

    /* --- 1) Accelerometre : simulation + classification --- */
    for (d = 0; d < JOURS; d++) {
        int n_res   = plan_res[d]  * WIN_PAR_MIN;
        int n_aero  = plan_aero[d] * WIN_PAR_MIN;
        int n_leger = plan_leger   * WIN_PAR_MIN;
        int n_total = MIN_SURVEILLEES * WIN_PAR_MIN;
        for (int wnd = 0; wnd < n_total; wnd++) {
            Activite vrai;
            if (wnd < n_res)                          vrai = RESISTANCE;
            else if (wnd < n_res + n_aero)            vrai = AEROBIE;
            else if (wnd < n_res + n_aero + n_leger)  vrai = LEGER;
            else                                      vrai = REPOS;

            for (i = 0; i < WIN; i++)
                echantillon(vrai, (double)i / FS, &w[0][i], &w[1][i], &w[2][i]);

            Activite detecte = classer(analyser(w));
            win_det[d][detecte]++;
        }
        for (c = 0; c < NB_CLASSES; c++) min_det[d][c] = win_det[d][c] / WIN_PAR_MIN;
    }

    /* --- 2) Journal --- */
    int nj = lire_journal(chemin, journal, MAX_SEANCES);
    if (nj <= 0) {
        printf("Fichier '%s' introuvable : utilisation du journal d'exemple integre.\n\n", chemin);
        nj = journal_defaut(journal, MAX_SEANCES);
    }

    int    jour_res[JOURS + 1] = { 0 };
    int    min_res_j[JOURS + 1] = { 0 }, min_aero_j[JOURS + 1] = { 0 };
    double volume_res = 0.0, somme_ratio = 0.0, somme_reps = 0.0;
    int    exo_inconnus = 0;

    for (i = 0; i < nj; i++) {
        Seance *s = &journal[i];
        if (s->type == 'R') {
            jour_res[s->jour] = 1;
            min_res_j[s->jour] += s->minutes;
            double vol = (double)s->series * s->reps * s->charge_kg;   /* kg soulevés au total */
            volume_res += vol;
            double ref = charge_ref(s->exo);
            if (ref > 0.0) {
                somme_ratio += min1(s->charge_kg / ref) * s->series * s->reps;
                somme_reps  += (double)s->series * s->reps;
            } else {
                exo_inconnus++;
            }
        } else if (s->type == 'A') {
            min_aero_j[s->jour] += s->minutes;
        }
    }

    /* --- 3) Rapport --- */
    printf("=== PROGRAMME 1 : ACTIVITE PHYSIQUE (semaine simulee, microgravite) ===\n\n");
    printf("Jour | Accelerometre (minutes detectees)        | Journal (minutes)\n");
    printf("     | repos  leger  resist. aerobie            | resist. aerobie\n");
    printf("-----+------------------------------------------+------------------\n");

    int tot_res_det = 0, tot_aero_det = 0, tot_res_j = 0;
    for (d = 0; d < JOURS; d++) {
        printf("  %d  | %5d %6d %7d %7d            | %7d %7d\n", d + 1,
               min_det[d][REPOS], min_det[d][LEGER],
               min_det[d][RESISTANCE], min_det[d][AEROBIE],
               min_res_j[d + 1], min_aero_j[d + 1]);
        tot_res_det  += min_det[d][RESISTANCE];
        tot_aero_det += min_det[d][AEROBIE];
        tot_res_j    += min_res_j[d + 1];
    }

    int total_ex = tot_res_det + tot_aero_det;
    int jours_res = 0;
    for (d = 1; d <= JOURS; d++) jours_res += jour_res[d];

    double load_score = (somme_reps > 0.0) ? somme_ratio / somme_reps : 0.0;
    double time_score = min1(total_ex / REF_MIN_SEM);
    double days_score = min1(jours_res / REF_JOURS_RES);
    double dose = W_TEMPS * time_score + W_JOURS_RES * days_score + W_CHARGE * load_score;

    printf("\n--- Resume semaine ---\n");
    printf("Exercice detecte (resistance + aerobie) : %d min  (ref ISS : %.0f, plage %.0f-%.0f)\n",
           total_ex, REF_MIN_SEM, REF_MIN_BAS, REF_MIN_HAUT);
    printf("Jours avec resistance (journal)         : %d  (ref : >= %.0f)\n", jours_res, REF_JOURS_RES);
    printf("Volume de resistance (series*reps*kg)   : %.0f kg\n", volume_res);
    printf("Charge relative aux medianes ISS        : %.0f %%\n", 100.0 * load_score);

    if (tot_res_j > 0) {
        double ecart = 100.0 * fabs((double)tot_res_det - tot_res_j) / tot_res_j;
        printf("Coherence resistance accelero/journal   : ecart %.1f %%%s\n",
               ecart, ecart > 20.0 ? "  <-- verifier la saisie ou le capteur" : "  (OK)");
    }
    if (exo_inconnus > 0)
        printf("Note : %d ligne(s) du journal avec un exercice sans charge de reference.\n", exo_inconnus);

    printf("\nScore temps=%.2f  jours resistance=%.2f  charge=%.2f\n", time_score, days_score, load_score);
    printf(">>> DOSE D'EXERCICE (0 a 1) : %.2f\n", dose);

    printf("\n--- Alertes ---\n");
    int alertes = 0;
    if (total_ex < REF_MIN_BAS) {
        printf("- Temps d'exercice sous la plage ISS : ajouter des seances.\n"); alertes++;
    }
    if (jours_res < (int)REF_JOURS_RES) {
        printf("- Moins de 3 jours de resistance : ajouter une seance de resistance.\n"); alertes++;
    }
    if (load_score > 0.0 && load_score < 0.8) {
        printf("- Charges inferieures aux medianes ISS : augmenter progressivement la charge.\n"); alertes++;
    }
    if (alertes == 0) printf("Aucune alerte.\n");
    printf("\nRappel : meme avec ~600 min/sem, une part des astronautes n'est pas\n");
    printf("completement protegee (Scott et al. 2023) : la dose est un indicateur, pas une garantie.\n");

    /* --- 4) Sortie pour le modele os/muscle --- */
    FILE *out = fopen("dose.txt", "w");
    if (out) {
        fprintf(out, "dose=%.3f\n", dose);
        fclose(out);
        printf("\n(dose ecrite dans dose.txt)\n");
    }
    return 0;
}
