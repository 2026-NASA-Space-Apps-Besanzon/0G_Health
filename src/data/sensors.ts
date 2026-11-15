export type TagKind = 'sensed' | 'ml' | 'you' | 'ship';
export const TAGS: Record<TagKind, string> = {
  sensed: 'Sensed',
  ml: 'Estimated by ML',
  you: 'You measure it',
  ship: 'From the ship',
};

export type SensorId = 'eeg' | 'fnirs' | 'ppg' | 'imu' | 'temp' | 'voice';
export type Region = 'brain' | 'eyes' | 'ear' | 'heart' | 'lungs' | 'stomach' | 'bones' | 'skin';

export interface Sensor {
  id: SensorId; no: string; short: string; name: string;
  /** design estimate, grams. Not sourced. */ grams: number;
  job: string; watches: string; sits: string;
  shows: { label: string; value: string; unit: string; tag: TagKind; future?: boolean; note: string }[];
  cannot: string; /** one-line version for the spec sheet */ limit: string; regions: Region[]; future?: boolean;
  signal: 'eeg' | 'slow' | 'pulse' | 'imu' | 'flat' | 'voice';
  rawLabel: string;
}

export const SENSORS: Sensor[] = [
  {
    id: 'eeg', no: 'S-01', short: 'EEG', name: 'EEG, dry electrodes', grams: 18,
    job: 'Reads the brain\'s electrical activity through the cap lining. No gel.',
    watches: 'Fatigue and sleep loss',
    sits: 'Seven contacts across the crown, pressed lightly against the scalp.',
    shows: [
      { label: 'Alertness', value: '72', unit: '/ 100', tag: 'ml', note: 'Always drawn with a confidence band, never a bare number.' },
      { label: 'Sleep stages', value: '6.9', unit: 'h', tag: 'ml', note: 'From the soft headband at night.' },
    ],
    cannot: 'It cannot read thoughts or diagnose a condition. It estimates alertness and sleep, and it can be wrong, so every estimate shows how sure it is.',
    limit: 'Cannot read thoughts or diagnose. It estimates, and shows how sure it is.',
    regions: ['brain'], signal: 'eeg', rawLabel: 'Raw EEG · 7 channels · stays on board',
  },
  {
    id: 'fnirs', no: 'S-02', short: 'fNIRS', name: 'fNIRS, light-based', grams: 22, future: true,
    job: 'Shines near-infrared light through the forehead to track blood oxygen in the brain.',
    watches: 'Mental overload',
    sits: 'A flat strip on the forehead: two emitters, two detectors.',
    shows: [
      { label: 'Mental workload', value: '0.41', unit: 'index', tag: 'ml', future: true, note: 'Cross-checks the EEG estimate with a slower, less noisy signal.' },
    ],
    cannot: 'It only sees the outer centimetre or two of the forehead, and it is slow. This sensor is future work: everything shown here is simulated.',
    limit: 'Sees only the outer forehead, and slowly. Future work, simulated here.',
    regions: ['brain'], signal: 'slow', rawLabel: 'Oxygenated / de-oxygenated blood · simulated',
  },
  {
    id: 'ppg', no: 'S-03', short: 'PPG', name: 'PPG, optical pulse', grams: 4,
    job: 'A small light and photodiode at the temple that watches blood pulse under the skin.',
    watches: 'Heart and stress load',
    sits: 'Right temple, just ahead of the ear cup. An ear-clip variant fits the headband.',
    shows: [
      { label: 'Resting pulse', value: '54', unit: 'bpm', tag: 'sensed', note: 'Taken during the still two minutes each morning.' },
      { label: 'Heart-rhythm variability', value: '68', unit: 'ms', tag: 'sensed', note: 'Higher is calmer. Falling for weeks means load is building.' },
      { label: 'Blood oxygen', value: '97', unit: '%', tag: 'sensed', note: 'The number to watch on a spacewalk.' },
    ],
    cannot: 'It is an optical sensor, not a chest-electrode heart trace. It gives rate, rhythm variability and oxygen. It cannot show the electrical shape of a heartbeat.',
    limit: 'Optical only. It cannot show the electrical shape of a heartbeat.',
    regions: ['heart', 'lungs'], signal: 'pulse', rawLabel: 'Optical pulse wave',
  },
  {
    id: 'imu', no: 'S-04', short: 'IMU', name: 'IMU, motion', grams: 3,
    job: 'An accelerometer and gyroscope that record how the head moves.',
    watches: 'Motion sickness and falls',
    sits: 'One chip at the rear of the crown, where the head turns around it.',
    shows: [
      { label: 'Head movement', value: '31', unit: '°/s', tag: 'sensed', note: 'Set against the symptoms you report in the first three days.' },
      { label: 'Fall detection', value: 'Armed', unit: '', tag: 'sensed', note: 'For landing day, when legs have forgotten gravity.' },
      { label: 'Exercise', value: '96', unit: 'min', tag: 'sensed', note: 'Counted, so the bone and muscle log fills itself.' },
    ],
    cannot: 'It knows that your head moved, not how you feel. Nausea is something only you can report, so the tool asks.',
    limit: 'Knows that your head moved, not how you feel. So the tool asks.',
    regions: ['ear', 'stomach', 'bones'], signal: 'imu', rawLabel: 'Head rotation · 3 axes',
  },
  {
    id: 'temp', no: 'S-05', short: 'Temp', name: 'Skin temperature', grams: 2,
    job: 'A thermistor against the forehead that follows skin temperature through the day.',
    watches: 'Fever and overheating',
    sits: 'Forehead edge, under the cap rim.',
    shows: [
      { label: 'Skin temperature', value: '34.6', unit: '°C', tag: 'sensed', note: 'A slow upward trend can be the first sign the immune system is busy.' },
    ],
    cannot: 'Skin temperature is not core temperature. It shows a trend, and a trend is a reason to take a proper reading with the ship\'s thermometer.',
    limit: 'Skin, not core temperature. A trend is a reason to use a real thermometer.',
    regions: ['skin'], signal: 'flat', rawLabel: 'Skin temperature · one sample a minute',
  },
  {
    id: 'voice', no: 'S-06', short: 'Voice', name: 'Cap microphones', grams: 0, future: true,
    job: 'The two microphones already in the cap. No new hardware.',
    watches: 'Stress and low mood',
    sits: 'On the two booms in front of the mouth, where they have always been.',
    shows: [
      { label: 'Voice stress', value: '0.22', unit: 'index', tag: 'ml', future: true, note: 'Opt-in. Analysed on the device. Only this number leaves it, never a recording.' },
    ],
    cannot: 'It does not record, transcribe or send what you say. It is off unless you turn it on. This reading is future work and simulated here.',
    limit: 'Never records or sends speech. Off unless you turn it on.',
    regions: ['brain'], signal: 'voice', rawLabel: 'Voice envelope · never stored',
  },
];

export const sensor = (id: string) => SENSORS.find((s) => s.id === id)!;

export const REGIONS: Record<Region, string> = {
  brain: 'Brain', eyes: 'Eyes', ear: 'Inner ear', heart: 'Heart', lungs: 'Lungs', stomach: 'Stomach', bones: 'Bone and muscle', skin: 'Skin and immune',
};
