/*
 * nutrition.c  -  PROGRAMME 2 : bilan nutritionnel de l'astronaute
 *
 * - Lit une base d'aliments (foods.csv) et le menu mange (menu.csv),
 *   ou utilise des donnees d'exemple INTEGREES si les fichiers sont absents
 * - Calcule les apports du jour : energie, proteines, calcium, vitamine D, sodium, eau...
 * - Compare aux besoins de la norme NASA JSC-67378 Rev 1 (missions <= 365 jours)
 * - Calcule un score de conformite (0 a 1) et un facteur de penalite P_nutrition
 *   (ecrits dans nutrition.txt) pour le modele de perte osseuse et musculaire
 *
 * Compilation : gcc -O2 -Wall -Wextra -o nutrition nutrition.c -lm
 * Utilisation : ./nutrition [H|F age taille_m masse_kg facteur_activite heures_EVA] [menu.csv] [foods.csv]
 * Defaut      : H 46 1.76 79 1.25 0  (moyenne des astronautes ISS etudies)
 *
 * ATTENTION : les valeurs nutritionnelles de foods.csv sont des EXEMPLES approximatifs.
 * Remplacez-les par la liste officielle des aliments NASA / ISS.
 * Les poids du score et PEN_MAX sont des HYPOTHESES de modelisation (pas de formule NASA publiee).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

#define MAX_ALIMENTS 128
#define MAX_MENU     64

/* ---------- NASA JSC-67378 Rev 1 ---------- */
#define PROT_MIN_KGKG   1.2     /* g de proteines / kg */
#define PROT_MAX_KGKG   1.8
#define CA_MIN          1000.0  /* mg  (cible 1000-1200) */
#define CA_MAX          2500.0  /* mg  (limite haute)    */
#define VITD_MIN        1000.0  /* UI (25 ug)            */
#define NA_MIN          1500.0  /* mg                    */
#define NA_MAX          2300.0  /* mg                    */
#define EAU_ML_KG       32.0    /* mL / kg               */
#define EAU_MIN_H       2500.0  /* mL minimum homme      */
#define EAU_MIN_F       2100.0  /* mL minimum femme      */
#define GLUC_MIN_PCT    45.0
#define GLUC_MAX_PCT    65.0
#define LIP_MIN_PCT     20.0
#define LIP_MAX_PCT     35.0
#define EVA_KCAL_PAR_H  200.0   /* kcal supplementaires par heure d'EVA */

/* ---------- HYPOTHESES : ponderation du score et penalite maximale ---------- */
#define W_ENERGIE 0.35
#define W_CA      0.20
#define W_VITD    0.20
#define W_PROT    0.15
#define W_NA      0.05
#define W_EAU     0.05
#define PEN_MAX   0.50          /* P_nutrition varie de 1.00 (parfait) a 1.50 (tres mauvais) */

typedef struct {
    char   nom[32];
    double kcal, prot, ca, vitd, na, gluc, lip, eau;   /* par portion */
} Aliment;

typedef struct { double kcal, prot, ca, vitd, na, gluc, lip, eau; } Totaux;

/* ====================== Lecture des fichiers ====================== */

/* ---------- Donnees d'exemple INTEGREES (utilisees si les fichiers CSV sont absents) ----------
 * Valeurs approximatives par portion : a remplacer par la liste officielle NASA/ISS.
 * Format : nom,kcal,proteines_g,calcium_mg,vitD_UI,sodium_mg,glucides_g,lipides_g,eau_mL */
static const char *ALIMENTS_DEFAUT[] = {
    "Cereales_lait,250,10,300,100,250,45,4,200",
    "Oeufs_brouilles,150,10,60,80,150,2,11,80",
    "Poulet_riz,450,30,40,0,600,55,10,150",
    "Saumon_legumes,400,28,40,400,350,10,24,150",
    "Yaourt,150,8,300,0,110,17,5,120",
    "Fromage,110,7,200,10,180,1,9,10",
    "Lentilles_riz,400,18,60,0,300,70,5,200",
    "Laitue_salade,30,2,40,0,30,5,1,80",
    "Pain_complet,200,8,50,0,380,36,3,20",
    "Barre_proteinee,220,15,100,0,150,22,8,5",
    "Biscuits,200,3,20,0,150,28,9,0",
    "Fruits_secs,160,2,40,0,5,40,1,20",
    "Supplement_vitD_1000UI,0,0,0,1000,0,0,0,0",
    "Eau_500mL,0,0,0,0,0,0,0,500"
};
#define NB_ALIMENTS_DEFAUT ((int)(sizeof(ALIMENTS_DEFAUT) / sizeof(ALIMENTS_DEFAUT[0])))

/* Menu d'exemple : nom,fraction_mangee (1 = portion entiere, 0.5 = moitie, 4 = quatre portions) */
static const char *MENU_DEFAUT[] = {
    "Cereales_lait,1.0", "Oeufs_brouilles,1.0", "Poulet_riz,1.0", "Saumon_legumes,0.5",
    "Yaourt,1.0", "Pain_complet,1.0", "Barre_proteinee,1.0", "Lentilles_riz,1.0",
    "Laitue_salade,1.0", "Biscuits,1.0", "Fruits_secs,1.0", "Eau_500mL,4"
};
#define NB_MENU_DEFAUT ((int)(sizeof(MENU_DEFAUT) / sizeof(MENU_DEFAUT[0])))

static int ligne_ignoree(const char *ligne)
{
    return ligne[0] == '#' || ligne[0] == '\n' || ligne[0] == '\r' || ligne[0] == '\0';
}

static int parser_aliment(const char *ligne, Aliment *a)
{
    if (ligne_ignoree(ligne)) return 0;
    return sscanf(ligne, "%31[^,],%lf,%lf,%lf,%lf,%lf,%lf,%lf,%lf",
                  a->nom, &a->kcal, &a->prot, &a->ca, &a->vitd,
                  &a->na, &a->gluc, &a->lip, &a->eau) == 9;
}

static int lire_aliments(const char *chemin, Aliment *tab, int max)
{
    FILE *f = fopen(chemin, "r");
    char ligne[256];
    int n = 0;
    if (!f) return -1;
    while (fgets(ligne, sizeof ligne, f) && n < max) {
        Aliment a;
        if (parser_aliment(ligne, &a)) tab[n++] = a;
    }
    fclose(f);
    return n;
}

static int aliments_defaut(Aliment *tab, int max)
{
    int n = 0;
    for (int i = 0; i < NB_ALIMENTS_DEFAUT && n < max; i++) {
        Aliment a;
        if (parser_aliment(ALIMENTS_DEFAUT[i], &a)) tab[n++] = a;
    }
    return n;
}

/* Le menu est stocke sous forme de lignes de texte "nom,fraction" */
static int lire_menu(const char *chemin, char menu[][128], int max)
{
    FILE *f = fopen(chemin, "r");
    char ligne[128];
    int n = 0;
    if (!f) return -1;
    while (fgets(ligne, sizeof ligne, f) && n < max) {
        if (ligne_ignoree(ligne)) continue;
        snprintf(menu[n], 128, "%s", ligne);
        n++;
    }
    fclose(f);
    return n;
}

static int menu_defaut(char menu[][128], int max)
{
    int n = 0;
    for (int i = 0; i < NB_MENU_DEFAUT && n < max; i++) {
        snprintf(menu[n], 128, "%s", MENU_DEFAUT[i]);
        n++;
    }
    return n;
}

static const Aliment *trouver(const Aliment *tab, int n, const char *nom)
{
    for (int i = 0; i < n; i++)
        if (strcmp(tab[i].nom, nom) == 0) return &tab[i];
    return NULL;
}

/* ====================== Fonctions de score (0 a 1) ====================== */

static double score_min(double v, double mn)
{
    return v >= mn ? 1.0 : v / mn;
}

static double score_plage(double v, double mn, double mx)
{
    if (v < mn)  return v / mn;
    if (v <= mx) return 1.0;
    double s = 1.0 - (v - mx) / mx;
    return s < 0.0 ? 0.0 : s;
}

/* Energie : ratio apport/besoin. En dessous = proportionnel ; 1.00-1.15 = OK ; au-dela = penalise */
static double score_energie(double ratio)
{
    if (ratio < 1.0)   return ratio;
    if (ratio <= 1.15) return 1.0;
    double s = 1.0 - (ratio - 1.15);
    return s < 0.0 ? 0.0 : s;
}

static const char *statut(double v, double mn, double mx)
{
    if (v < mn) return "BAS";
    if (v > mx) return "ELEVE";
    return "OK";
}

/* ====================== Programme principal ====================== */

int main(int argc, char **argv)
{
    char   sexe = 'H';
    double age = 46.0, taille = 1.76, masse = 79.0, pa = 1.25, eva_h = 0.0;
    const char *f_menu = "menu.csv", *f_foods = "foods.csv";
    int arg = 1;

    if (argc >= 7) {
        sexe  = (argv[1][0] == 'F' || argv[1][0] == 'f') ? 'F' : 'H';
        age   = atof(argv[2]);
        taille = atof(argv[3]);
        masse = atof(argv[4]);
        pa    = atof(argv[5]);
        eva_h = atof(argv[6]);
        arg = 7;
    }
    if (argc > arg)     f_menu  = argv[arg];
    if (argc > arg + 1) f_foods = argv[arg + 1];

    static Aliment base[MAX_ALIMENTS];
    static char menu[MAX_MENU][128];
    int repli = 0;

    int nb = lire_aliments(f_foods, base, MAX_ALIMENTS);
    if (nb <= 0) {
        printf("Fichier '%s' introuvable : base d'aliments d'exemple integree.\n", f_foods);
        nb = aliments_defaut(base, MAX_ALIMENTS);
        repli = 1;
    }
    int nm = lire_menu(f_menu, menu, MAX_MENU);
    if (nm <= 0) {
        printf("Fichier '%s' introuvable : menu d'exemple integre.\n", f_menu);
        nm = menu_defaut(menu, MAX_MENU);
        repli = 1;
    }
    if (repli) printf("\n");

    /* --- Totaux du menu --- */
    Totaux t = { 0 };
    int inconnus = 0;
    for (int m = 0; m < nm; m++) {
        char nom[32];
        double frac;
        if (sscanf(menu[m], "%31[^,],%lf", nom, &frac) != 2) continue;
        const Aliment *a = trouver(base, nb, nom);
        if (!a) { printf("Aliment inconnu dans la base : %s\n", nom); inconnus++; continue; }
        t.kcal += a->kcal * frac;  t.prot += a->prot * frac;
        t.ca   += a->ca   * frac;  t.vitd += a->vitd * frac;
        t.na   += a->na   * frac;  t.gluc += a->gluc * frac;
        t.lip  += a->lip  * frac;  t.eau  += a->eau  * frac;
    }

    /* --- Besoins individuels (NASA JSC-67378) --- */
    double eer;
    if (sexe == 'H') eer = 622.0 - 9.53 * age + pa * (15.9 * masse + 539.6 * taille);
    else             eer = 354.0 - 6.91 * age + pa * (9.36 * masse + 726.0 * taille);
    double besoin_kcal = eer + EVA_KCAL_PAR_H * eva_h;

    double prot_min = PROT_MIN_KGKG * masse, prot_max = PROT_MAX_KGKG * masse;
    double eau_min  = EAU_ML_KG * masse;
    double plancher = (sexe == 'H') ? EAU_MIN_H : EAU_MIN_F;
    if (eau_min < plancher) eau_min = plancher;

    double ratio_e   = t.kcal / besoin_kcal;
    double pct_gluc  = (t.kcal > 0) ? 100.0 * t.gluc * 4.0 / t.kcal : 0.0;
    double pct_lip   = (t.kcal > 0) ? 100.0 * t.lip  * 9.0 / t.kcal : 0.0;

    /* --- Scores --- */
    double s_e  = score_energie(ratio_e);
    double s_ca = score_plage(t.ca, CA_MIN, CA_MAX);
    double s_d  = score_min(t.vitd, VITD_MIN);
    double s_p  = score_plage(t.prot, prot_min, prot_max);
    double s_na = score_plage(t.na, NA_MIN, NA_MAX);
    double s_h  = score_min(t.eau, eau_min);

    double S = W_ENERGIE * s_e + W_CA * s_ca + W_VITD * s_d + W_PROT * s_p + W_NA * s_na + W_EAU * s_h;
    double P = 1.0 + PEN_MAX * (1.0 - S);

    /* --- Rapport --- */
    printf("=== PROGRAMME 2 : BILAN NUTRITIONNEL (norme NASA JSC-67378) ===\n");
    printf("Profil : %c, %.0f ans, %.2f m, %.1f kg, facteur d'activite %.2f, EVA %.1f h\n\n",
           sexe, age, taille, masse, pa, eva_h);

    printf("%-16s %10s %20s %10s  %s\n", "Nutriment", "Apport", "Besoin NASA", "Couverture", "Statut");
    printf("%-16s %7.0f kcal %14.0f kcal %9.0f%%  %s\n", "Energie",
           t.kcal, besoin_kcal, 100.0 * ratio_e, ratio_e < 1.0 ? "BAS" : (ratio_e > 1.15 ? "ELEVE" : "OK"));
    printf("%-16s %8.0f g %11.0f-%.0f g %9.0f%%  %s\n", "Proteines",
           t.prot, prot_min, prot_max, 100.0 * t.prot / prot_min, statut(t.prot, prot_min, prot_max));
    printf("%-16s %7.0f mg %12.0f-%.0f mg %7.0f%%  %s\n", "Calcium",
           t.ca, CA_MIN, 1200.0, 100.0 * t.ca / CA_MIN, statut(t.ca, CA_MIN, CA_MAX));
    printf("%-16s %7.0f UI %16.0f UI %9.0f%%  %s\n", "Vitamine D",
           t.vitd, VITD_MIN, 100.0 * t.vitd / VITD_MIN, t.vitd < VITD_MIN ? "BAS" : "OK");
    printf("%-16s %7.0f mg %12.0f-%.0f mg %9s  %s\n", "Sodium",
           t.na, NA_MIN, NA_MAX, "-", statut(t.na, NA_MIN, NA_MAX));
    printf("%-16s %7.0f mL %15.0f mL %9.0f%%  %s\n", "Eau",
           t.eau, eau_min, 100.0 * t.eau / eau_min, t.eau < eau_min ? "BAS" : "OK");
    printf("%-16s %9.0f %% %12.0f-%.0f %% %9s  %s\n", "Glucides (% E)",
           pct_gluc, GLUC_MIN_PCT, GLUC_MAX_PCT, "-", statut(pct_gluc, GLUC_MIN_PCT, GLUC_MAX_PCT));
    printf("%-16s %9.0f %% %12.0f-%.0f %% %9s  %s\n", "Lipides (% E)",
           pct_lip, LIP_MIN_PCT, LIP_MAX_PCT, "-", statut(pct_lip, LIP_MIN_PCT, LIP_MAX_PCT));

    printf("\nBilan energetique : %+.0f kcal (apport - besoin)\n", t.kcal - besoin_kcal);

    printf("\n--- Alertes ---\n");
    int al = 0;
    if (ratio_e < 0.90) { printf("- Deficit energetique : risque de perte de masse, muscle et os. Manger davantage.\n"); al++; }
    if (t.vitd < VITD_MIN) { printf("- Vitamine D sous 1000 UI : completer (supplement si les aliments ne suffisent pas).\n"); al++; }
    if (t.ca < CA_MIN)  { printf("- Calcium sous 1000 mg : ajouter des produits riches en calcium.\n"); al++; }
    if (t.ca > CA_MAX)  { printf("- Calcium au-dessus de 2500 mg : reduire.\n"); al++; }
    if (t.prot < prot_min) { printf("- Proteines sous %.1f g/kg.\n", PROT_MIN_KGKG); al++; }
    if (t.prot > prot_max) { printf("- Proteines au-dessus de %.1f g/kg : peut aggraver la resorption osseuse.\n", PROT_MAX_KGKG); al++; }
    if (t.na > NA_MAX)  { printf("- Sodium au-dessus de 2300 mg : risque osseux et renal.\n"); al++; }
    if (t.eau < eau_min){ printf("- Eau insuffisante : risque de calculs renaux. Boire davantage.\n"); al++; }
    if (inconnus > 0)   { printf("- %d aliment(s) du menu absent(s) de la base.\n", inconnus); al++; }
    if (al == 0) printf("Aucune alerte.\n");

    printf("\nScores : energie %.2f | calcium %.2f | vit.D %.2f | proteines %.2f | sodium %.2f | eau %.2f\n",
           s_e, s_ca, s_d, s_p, s_na, s_h);
    printf(">>> SCORE NUTRITIONNEL (0 a 1)         : %.2f\n", S);
    printf(">>> PENALITE P_nutrition (1.00 a %.2f) : %.3f\n", 1.0 + PEN_MAX, P);
    printf("(Ponderation et PEN_MAX = hypotheses de modelisation, a justifier dans le projet.)\n");

    FILE *out = fopen("nutrition.txt", "w");
    if (out) {
        fprintf(out, "score=%.3f\npenalite=%.3f\n", S, P);
        fclose(out);
        printf("\n(resultats ecrits dans nutrition.txt)\n");
    }
    return 0;
}