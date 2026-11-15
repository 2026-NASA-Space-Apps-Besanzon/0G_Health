/* nutrition_compact.c - bone/muscle nutrition scores. gcc x.c -lm
   Food values are APPROXIMATE examples: replace with NASA/USDA data. */
#include <stdio.h>
#include <math.h>
#define N 30            /* days */
#define BS 15           /* bad diet from day... */
#define BE 22           /* ...to day (0 0 = off) */
#define MALE 1
#define KG 80.0
#define CM 180.0
#define AGE 35.0
/* kcal prot Ca vitD vitK Mg K omega3 fluid Na P */
double F[][11]={
{180,12,60,90,1,12,150,.1,60,200,200},      /*0 eggs*/
{250,9,200,100,1,60,300,.1,150,150,250},    /*1 oatmeal+milk*/
{110,1,120,100,0,25,450,0,250,10,40},       /*2 juice*/
{350,22,30,5,2,40,400,.1,80,400,220},       /*3 beef rice*/
{380,24,40,5,3,45,350,.1,80,350,230},       /*4 chicken pasta*/
{210,22,15,400,0,30,400,1.8,0,350,250},     /*5 salmon*/
{330,11,60,0,1,50,250,0,0,300,180},         /*6 tortilla*/
{95,7,160,0,330,115,900,.2,80,130,150},     /*7 greens*/
{150,8,280,80,0,30,380,0,0,100,220},        /*8 yogurt*/
{160,6,75,0,0,77,200,0,0,0,135},            /*9 almonds*/
{250,4,50,0,0,40,150,0,0,150,100},          /*10 energy bar*/
{120,8,300,120,0,24,370,0,250,105,230},     /*11 milk*/
{0,0,0,0,0,0,0,0,250,0,0},                  /*12 water*/
{0,0,0,600,0,0,0,0,0,0,0},                  /*13 vit D pill*/
{10,0,0,0,0,0,0,1,0,0,0}};                  /*14 omega-3 pill*/
/* menu: food, servings (food 4 = chicken on odd days, salmon on even) */
double A[][2]={{0,1},{1,1},{2,1},{3,1},{6,1},{7,1},{8,1},{9,2},{10,2},
{4,1},{11,1},{12,4},{13,1},{14,1}};
double B[][2]={{0,1},{6,1},{9,1},{12,3}};
/* weights: energy prot Ca vitD vitK Mg K om3 fluid Na P/Ca */
double WB[]={.10,.12,.22,.20,.08,.06,.04,.04,.04,.07,.03};
double WM[]={.24,.36,.04,.10,0,.08,.04,.06,.06,.02,0};
double T[11],I[N+1][11];

double sc(int i,double*v){
  double r=v[i]/T[i];
  if(i==0)return r<.9?(.9-r)/.9:(r>1.15?.5*fmin(1,(r-1.15)/.5):0);
  if(i==9)return r<=1?0:fmin(1,r-1);
  if(i==10){if(v[2]<=0)return 1;r=v[10]/v[2]/T[10];return r<=1?0:fmin(1,r-1);}
  return r>=.9?0:(.9-r)/.9;
}
int low(int d,int n,int i,double f){
  if(d<n)return 0;
  for(int x=d-n+1;x<=d;x++)if(I[x][i]>=f*T[i])return 0;
  return 1;
}
int main(void){
  double eb=0,em=0,ab=2.0/15,am=2.0/4;
  T[0]=(10*KG+6.25*CM-5*AGE+(MALE?5:-161))*1.6;
  T[1]=1.2*KG;T[2]=1200;T[3]=1000;T[4]=MALE?120:90;T[5]=350;T[6]=3400;
  T[7]=MALE?1.6:1.1;T[8]=2000;T[9]=2300;T[10]=1.5;
  for(int d=1;d<=N;d++){
    int bad=(d>=BS&&d<=BE);
    int n=bad?4:14;
    for(int k=0;k<n;k++){
      int f=bad?(int)B[k][0]:(int)A[k][0];
      double s=bad?B[k][1]:A[k][1];
      if(f==4&&d%2==0)f=5;
      for(int j=0;j<11;j++)I[d][j]+=s*F[f][j];
    }
  }
  printf("Day | kcal prot   Ca vitD | rawB  rawM | smB   smM  | Alerts\n");
  for(int d=1;d<=N;d++){
    double rb=0,rm=0;
    for(int i=0;i<11;i++){double s=sc(i,I[d]);rb+=WB[i]*s;rm+=WM[i]*s;}
    double pb=eb,pm=em;
    eb+=ab*(rb-eb);em+=am*(rm-em);
    printf("%3d | %4.0f %4.0f %4.0f %4.0f | %.3f %.3f | %.3f %.3f | ",
      d,I[d][0],I[d][1],I[d][2],I[d][3],rb,rm,eb,em);
    if(low(d,3,1,.8))printf("PROTEIN LOW 3 DAYS; ");
    if(low(d,7,2,.8)||low(d,7,3,.8))printf("CALCIUM/VIT D LOW 7 DAYS; ");
    if(d>=3&&(I[d][0]+I[d-1][0]+I[d-2][0])/3<.85*T[0])printf("ENERGY DEFICIT; ");
    if(I[d][8]<.7*T[8])printf("LOW FLUID; ");
    if(rb-pb>.15||rm-pm>.15)printf("SUDDEN NUTRITION DROP; ");
    printf("\n");
  }
  printf("\nBone deficiency %.3f  Muscle deficiency %.3f (0 to 1)\n",eb,em);
  return 0;
}