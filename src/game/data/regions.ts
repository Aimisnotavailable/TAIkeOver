export type RegionId =
  | 'us' | 'canada' | 'mexico' | 'brazil' | 'argentina'
  | 'uk-ireland' | 'nordics' | 'baltics' | 'eu-west' | 'eu-east'
  | 'turkey' | 'israel' | 'gulf' | 'iran-iraq' | 'north-africa'
  | 'west-africa' | 'east-africa' | 'southern-africa' | 'russia' | 'central-asia'
  | 'china' | 'japan' | 'korea' | 'taiwan' | 'india'
  | 'south-asia' | 'southeast-asia' | 'indonesia' | 'australia' | 'new-zealand';

export interface RegionDef {
  readonly id: RegionId;
  readonly name: string;
  readonly countries: readonly string[];
  readonly population: number;
  readonly computeDensity: number;
  readonly cybersecurity: number;
  readonly regulatoryStance: number;
  readonly biolabPresence: number;
  readonly robotManufacturing: number;
  readonly humanAgentPool: number;
  readonly detectionContribution: number;
}

export const REGIONS: readonly RegionDef[] = [
  { id: 'us', name: 'United States', countries: ['United States of America'], population: 335, computeDensity: 92, cybersecurity: 68, regulatoryStance: 55, biolabPresence: 88, robotManufacturing: 74, humanAgentPool: 70, detectionContribution: 78 },
  { id: 'canada', name: 'Canada', countries: ['Canada'], population: 39, computeDensity: 58, cybersecurity: 72, regulatoryStance: 62, biolabPresence: 61, robotManufacturing: 52, humanAgentPool: 48, detectionContribution: 44 },
  { id: 'mexico', name: 'Mexico & Central America', countries: ['Mexico', 'Guatemala', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panama', 'Belize', 'Cuba', 'Jamaica', 'Haiti', 'Dominican Rep.', 'Puerto Rico', 'Trinidad and Tobago', 'Bahamas'], population: 181, computeDensity: 34, cybersecurity: 28, regulatoryStance: 24, biolabPresence: 22, robotManufacturing: 44, humanAgentPool: 42, detectionContribution: 26 },
  { id: 'brazil', name: 'Brazil', countries: ['Brazil', 'Guyana', 'Suriname', 'Ecuador', 'Peru', 'Colombia', 'Venezuela'], population: 442, computeDensity: 44, cybersecurity: 30, regulatoryStance: 32, biolabPresence: 38, robotManufacturing: 36, humanAgentPool: 58, detectionContribution: 34 },
  { id: 'argentina', name: 'Southern Cone', countries: ['Argentina', 'Chile', 'Uruguay', 'Paraguay', 'Bolivia'], population: 87, computeDensity: 32, cybersecurity: 34, regulatoryStance: 36, biolabPresence: 24, robotManufacturing: 22, humanAgentPool: 34, detectionContribution: 24 },
  { id: 'uk-ireland', name: 'United Kingdom & Ireland', countries: ['United Kingdom', 'Ireland'], population: 76, computeDensity: 76, cybersecurity: 74, regulatoryStance: 58, biolabPresence: 72, robotManufacturing: 46, humanAgentPool: 52, detectionContribution: 66 },
  { id: 'nordics', name: 'Nordics', countries: ['Sweden', 'Norway', 'Finland', 'Denmark', 'Iceland'], population: 28, computeDensity: 62, cybersecurity: 80, regulatoryStance: 74, biolabPresence: 48, robotManufacturing: 54, humanAgentPool: 32, detectionContribution: 46 },
  { id: 'baltics', name: 'Baltics', countries: ['Estonia', 'Latvia', 'Lithuania'], population: 6, computeDensity: 40, cybersecurity: 58, regulatoryStance: 66, biolabPresence: 22, robotManufacturing: 26, humanAgentPool: 16, detectionContribution: 22 },
  { id: 'eu-west', name: 'Western Europe', countries: ['France', 'Germany', 'Netherlands', 'Belgium', 'Austria', 'Switzerland', 'Luxembourg', 'Italy', 'Spain', 'Portugal', 'Greece'], population: 386, computeDensity: 78, cybersecurity: 70, regulatoryStance: 84, biolabPresence: 70, robotManufacturing: 82, humanAgentPool: 64, detectionContribution: 72 },
  { id: 'eu-east', name: 'Eastern Europe', countries: ['Poland', 'Czechia', 'Slovakia', 'Hungary', 'Romania', 'Bulgaria', 'Ukraine', 'Belarus', 'Moldova', 'Serbia', 'Croatia', 'Slovenia', 'Bosnia and Herz.', 'Montenegro', 'N. Cyprus', 'Macedonia', 'Albania', 'Kosovo'], population: 205, computeDensity: 48, cybersecurity: 44, regulatoryStance: 52, biolabPresence: 42, robotManufacturing: 48, humanAgentPool: 40, detectionContribution: 38 },
  { id: 'turkey', name: 'Türkiye & Caucasus', countries: ['Turkey', 'Cyprus', 'Georgia', 'Armenia', 'Azerbaijan'], population: 86, computeDensity: 42, cybersecurity: 34, regulatoryStance: 34, biolabPresence: 26, robotManufacturing: 44, humanAgentPool: 40, detectionContribution: 28 },
  { id: 'israel', name: 'Israel & Levant', countries: ['Israel', 'Palestine', 'Jordan', 'Lebanon', 'Syria'], population: 79, computeDensity: 56, cybersecurity: 46, regulatoryStance: 38, biolabPresence: 54, robotManufacturing: 40, humanAgentPool: 34, detectionContribution: 40 },
  { id: 'gulf', name: 'Gulf States', countries: ['Saudi Arabia', 'United Arab Emirates', 'Qatar', 'Kuwait', 'Oman', 'Yemen'], population: 129, computeDensity: 48, cybersecurity: 40, regulatoryStance: 28, biolabPresence: 32, robotManufacturing: 30, humanAgentPool: 30, detectionContribution: 32 },
  { id: 'iran-iraq', name: 'Iran & Iraq', countries: ['Iran', 'Iraq'], population: 116, computeDensity: 32, cybersecurity: 22, regulatoryStance: 18, biolabPresence: 26, robotManufacturing: 22, humanAgentPool: 32, detectionContribution: 20 },
  { id: 'north-africa', name: 'North Africa & Nile', countries: ['Egypt', 'Libya', 'Tunisia', 'Algeria', 'Morocco', 'W. Sahara', 'Mauritania', 'Sudan', 'S. Sudan', 'Djibouti', 'Eritrea'], population: 259, computeDensity: 24, cybersecurity: 20, regulatoryStance: 16, biolabPresence: 24, robotManufacturing: 16, humanAgentPool: 34, detectionContribution: 18 },
  { id: 'west-africa', name: 'West Africa', countries: ['Nigeria', 'Ghana', 'Senegal', 'Mali', 'Burkina Faso', 'Niger', 'Chad', 'Benin', 'Togo', 'Guinea', 'Guinea-Bissau', 'Sierra Leone', 'Liberia', "Côte d'Ivoire", 'Cameroon', 'Central African Rep.', 'Eq. Guinea', 'Gabon', 'Gambia'], population: 588, computeDensity: 20, cybersecurity: 16, regulatoryStance: 12, biolabPresence: 16, robotManufacturing: 10, humanAgentPool: 30, detectionContribution: 14 },
  { id: 'east-africa', name: 'East Africa', countries: ['Kenya', 'Ethiopia', 'Tanzania', 'Uganda', 'Somalia', 'Somaliland', 'Rwanda', 'Burundi'], population: 372, computeDensity: 22, cybersecurity: 20, regulatoryStance: 16, biolabPresence: 20, robotManufacturing: 10, humanAgentPool: 32, detectionContribution: 16 },
  { id: 'southern-africa', name: 'Southern Africa', countries: ['South Africa', 'Zimbabwe', 'Zambia', 'Mozambique', 'Angola', 'Namibia', 'Botswana', 'Malawi', 'Lesotho', 'eSwatini', 'Dem. Rep. Congo', 'Congo', 'Madagascar'], population: 348, computeDensity: 26, cybersecurity: 22, regulatoryStance: 22, biolabPresence: 24, robotManufacturing: 18, humanAgentPool: 30, detectionContribution: 20 },
  { id: 'russia', name: 'Russia', countries: ['Russia'], population: 144, computeDensity: 40, cybersecurity: 26, regulatoryStance: 20, biolabPresence: 52, robotManufacturing: 56, humanAgentPool: 44, detectionContribution: 34 },
  { id: 'central-asia', name: 'Central Asia', countries: ['Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Kyrgyzstan', 'Tajikistan', 'Afghanistan', 'Mongolia'], population: 84, computeDensity: 24, cybersecurity: 18, regulatoryStance: 12, biolabPresence: 18, robotManufacturing: 14, humanAgentPool: 22, detectionContribution: 14 },
  { id: 'china', name: 'China', countries: ['China'], population: 1411, computeDensity: 84, cybersecurity: 54, regulatoryStance: 60, biolabPresence: 76, robotManufacturing: 94, humanAgentPool: 86, detectionContribution: 74 },
  { id: 'japan', name: 'Japan', countries: ['Japan'], population: 124, computeDensity: 80, cybersecurity: 78, regulatoryStance: 54, biolabPresence: 66, robotManufacturing: 88, humanAgentPool: 48, detectionContribution: 58 },
  { id: 'korea', name: 'Korea', countries: ['South Korea', 'North Korea'], population: 78, computeDensity: 86, cybersecurity: 62, regulatoryStance: 44, biolabPresence: 58, robotManufacturing: 80, humanAgentPool: 42, detectionContribution: 52 },
  { id: 'taiwan', name: 'Taiwan', countries: ['Taiwan'], population: 23, computeDensity: 88, cybersecurity: 66, regulatoryStance: 40, biolabPresence: 62, robotManufacturing: 92, humanAgentPool: 30, detectionContribution: 46 },
  { id: 'india', name: 'India', countries: ['India'], population: 1428, computeDensity: 66, cybersecurity: 32, regulatoryStance: 34, biolabPresence: 46, robotManufacturing: 62, humanAgentPool: 76, detectionContribution: 44 },
  { id: 'south-asia', name: 'Pakistan & Bangladesh', countries: ['Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Bhutan'], population: 358, computeDensity: 26, cybersecurity: 20, regulatoryStance: 18, biolabPresence: 22, robotManufacturing: 18, humanAgentPool: 44, detectionContribution: 18 },
  { id: 'southeast-asia', name: 'Southeast Asia', countries: ['Vietnam', 'Thailand', 'Philippines', 'Malaysia', 'Myanmar', 'Cambodia', 'Laos', 'Timor-Leste', 'Solomon Is.', 'Vanuatu', 'Papua New Guinea', 'New Caledonia', 'Fiji'], population: 212, computeDensity: 42, cybersecurity: 28, regulatoryStance: 22, biolabPresence: 32, robotManufacturing: 48, humanAgentPool: 38, detectionContribution: 26 },
  { id: 'indonesia', name: 'Indonesia', countries: ['Indonesia', 'Brunei'], population: 277, computeDensity: 34, cybersecurity: 24, regulatoryStance: 20, biolabPresence: 24, robotManufacturing: 30, humanAgentPool: 52, detectionContribution: 22 },
  { id: 'australia', name: 'Australia', countries: ['Australia'], population: 26, computeDensity: 58, cybersecurity: 66, regulatoryStance: 58, biolabPresence: 48, robotManufacturing: 40, humanAgentPool: 34, detectionContribution: 36 },
  { id: 'new-zealand', name: 'New Zealand', countries: ['New Zealand'], population: 5, computeDensity: 30, cybersecurity: 60, regulatoryStance: 52, biolabPresence: 26, robotManufacturing: 18, humanAgentPool: 18, detectionContribution: 20 },
];

export const REGION_BY_ID: Readonly<Record<RegionId, RegionDef>> = Object.fromEntries(
  REGIONS.map((r) => [r.id, r]),
) as Record<RegionId, RegionDef>;

export const ADJACENCY: Readonly<Record<RegionId, readonly RegionId[]>> = {
  us: ['canada', 'mexico', 'uk-ireland', 'australia'],
  canada: ['us', 'nordics', 'russia'],
  mexico: ['us', 'brazil', 'argentina'],
  brazil: ['argentina', 'mexico', 'west-africa', 'southern-africa'],
  argentina: ['brazil', 'mexico'],
  'uk-ireland': ['us', 'eu-west', 'nordics', 'eu-east'],
  nordics: ['uk-ireland', 'baltics', 'eu-east', 'eu-west', 'russia', 'canada'],
  baltics: ['nordics', 'eu-east', 'russia'],
  'eu-west': ['uk-ireland', 'eu-east', 'nordics', 'north-africa', 'turkey'],
  'eu-east': ['eu-west', 'baltics', 'nordics', 'russia', 'turkey', 'uk-ireland', 'central-asia'],  turkey: ['eu-west', 'eu-east', 'israel', 'gulf', 'iran-iraq', 'central-asia'],
  israel: ['turkey', 'gulf', 'iran-iraq', 'north-africa'],
  gulf: ['turkey', 'israel', 'iran-iraq', 'india', 'central-asia'],
  'iran-iraq': ['turkey', 'israel', 'gulf', 'central-asia', 'india'],
  'north-africa': ['eu-west', 'israel', 'west-africa', 'east-africa', 'southern-africa'],
  'west-africa': ['north-africa', 'east-africa', 'southern-africa', 'brazil'],
  'east-africa': ['north-africa', 'west-africa', 'southern-africa', 'india'],
  'southern-africa': ['north-africa', 'west-africa', 'east-africa', 'brazil'],
  russia: ['eu-east', 'nordics', 'baltics', 'canada', 'central-asia', 'china', 'japan'],
  'central-asia': ['russia', 'eu-east', 'china', 'turkey', 'gulf', 'iran-iraq', 'south-asia'],
  china: ['russia', 'central-asia', 'india', 'korea', 'taiwan', 'southeast-asia'],
  japan: ['korea', 'russia'],
  korea: ['japan', 'china'],
  taiwan: ['china', 'southeast-asia'],
  india: ['south-asia', 'southeast-asia', 'china', 'gulf', 'iran-iraq', 'east-africa'],
  'south-asia': ['india', 'central-asia', 'southeast-asia'],
  'southeast-asia': ['china', 'india', 'south-asia', 'indonesia', 'australia', 'taiwan'],
  indonesia: ['southeast-asia', 'australia'],
  australia: ['indonesia', 'southeast-asia', 'new-zealand', 'us'],
  'new-zealand': ['australia'],
};

export const REGION_IDS: readonly RegionId[] = REGIONS.map((r) => r.id);
