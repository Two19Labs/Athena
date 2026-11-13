// Master Data Tables for Textile Weaving Factory (Grounding Master)

export const FACTORY_METADATA = {
  millName: "Athena Weaving Mills Ltd.",
  division: "Weaving & Loom Operations",
  sheds: [
    { id: "SHED-A", name: "Shed A (Air-Jet Weaving)", loomCount: 20 },
    { id: "SHED-B", name: "Shed B (Rapier Weaving)", loomCount: 20 }
  ]
};

// Registered Loom Master (Used for fuzzy matching and speed/efficiency bounds)
export const LOOM_MASTER = [
  // Air-jet Looms (Shed A) - High speed (650 - 850 RPM)
  { id: "L-101", shed: "SHED-A", type: "Airjet", model: "Tsudakoma ZAX9100", targetRpm: 750, widthCm: 190 },
  { id: "L-102", shed: "SHED-A", type: "Airjet", model: "Tsudakoma ZAX9100", targetRpm: 750, widthCm: 190 },
  { id: "L-103", shed: "SHED-A", type: "Airjet", model: "Tsudakoma ZAX9100", targetRpm: 750, widthCm: 190 },
  { id: "L-104", shed: "SHED-A", type: "Airjet", model: "Toyota JAT810", targetRpm: 800, widthCm: 210 },
  { id: "L-105", shed: "SHED-A", type: "Airjet", model: "Toyota JAT810", targetRpm: 800, widthCm: 210 },
  { id: "L-106", shed: "SHED-A", type: "Airjet", model: "Toyota JAT810", targetRpm: 800, widthCm: 210 },
  { id: "L-107", shed: "SHED-A", type: "Airjet", model: "Picanol OmniPlus-i", targetRpm: 850, widthCm: 220 },
  { id: "L-108", shed: "SHED-A", type: "Airjet", model: "Picanol OmniPlus-i", targetRpm: 850, widthCm: 220 },
  { id: "L-109", shed: "SHED-A", type: "Airjet", model: "Picanol OmniPlus-i", targetRpm: 850, widthCm: 220 },
  { id: "L-110", shed: "SHED-A", type: "Airjet", model: "Tsudakoma ZAX9100", targetRpm: 750, widthCm: 190 },

  // Rapier Looms (Shed B) - Medium speed (450 - 600 RPM)
  { id: "L-201", shed: "SHED-B", type: "Rapier", model: "Picanol OptiMax-i", targetRpm: 550, widthCm: 220 },
  { id: "L-202", shed: "SHED-B", type: "Rapier", model: "Picanol OptiMax-i", targetRpm: 550, widthCm: 220 },
  { id: "L-203", shed: "SHED-B", type: "Rapier", model: "Itema R9500", targetRpm: 500, widthCm: 190 },
  { id: "L-204", shed: "SHED-B", type: "Rapier", model: "Itema R9500", targetRpm: 500, widthCm: 190 },
  { id: "L-205", shed: "SHED-B", type: "Rapier", model: "Dornier P2", targetRpm: 480, widthCm: 260 }
];

// Fabric Sort / Quality Master (Picks Per Inch PPI, Warp/Weft count)
export const SORT_MASTER = [
  {
    code: "S-6060-92",
    description: "60s x 60s High Density Cambric",
    warpCount: "60s Compact",
    weftCount: "60s Compact",
    epi: 120, // Ends Per Inch
    ppi: 92,  // Picks Per Inch
    standardWidthInch: 50,
    targetEfficiencyPct: 88
  },
  {
    code: "S-4040-68",
    description: "40s x 40s Plain Sheeting Fabric",
    warpCount: "40s Ring Spun",
    weftCount: "40s Ring Spun",
    epi: 100,
    ppi: 68,
    standardWidthInch: 63,
    targetEfficiencyPct: 92
  },
  {
    code: "D-2020-54",
    description: "20s x 20s Heavy Denim Twill 3/1",
    warpCount: "20s Indigo Dyed",
    weftCount: "20s OE Cotton",
    epi: 72,
    ppi: 54,
    standardWidthInch: 58,
    targetEfficiencyPct: 85
  },
  {
    code: "P-5050-80",
    description: "50s Poplin Shirting Material",
    warpCount: "50s Combed",
    weftCount: "50s Combed",
    epi: 132,
    ppi: 80,
    standardWidthInch: 58,
    targetEfficiencyPct: 90
  }
];

// Downtime & Stoppage Master Codes
export const DOWNTIME_CODES = [
  { code: "DT-01", category: "Warp", label: "Beam Knotting / Gaiting", allowedToleranceMins: 120 },
  { code: "DT-02", category: "Electrical", label: "Electrical / Inverter Trip / Power Cut", allowedToleranceMins: 60 },
  { code: "DT-03", category: "Weft", label: "Weft Feeder Jam / Nozzle Fault", allowedToleranceMins: 45 },
  { code: "DT-04", category: "Mechanical", label: "Mechanical Breakdown / Rapier Guide", allowedToleranceMins: 90 },
  { code: "DT-05", category: "Material", label: "Yarn Wait / Cone Shortage", allowedToleranceMins: 30 },
  { code: "DT-06", category: "Maintenance", label: "Preventive Oiling & Cleaning", allowedToleranceMins: 30 },
  { code: "DT-07", category: "Handover", label: "Shift Change / Operator Meal", allowedToleranceMins: 30 },
  { code: "DT-99", category: "Other", label: "Unspecified Stoppage", allowedToleranceMins: 60 }
];

// Standard Defect Taxonomies
export const DEFECT_TYPES = [
  { id: "warp_break", label: "Warp Yarn Breakage", severity: "minor" },
  { id: "weft_break", label: "Weft Yarn Break / Missing Pick", severity: "minor" },
  { id: "slub", label: "Slub / Thick Yarn Contamination", severity: "major" },
  { id: "oil_stain", label: "Grease / Machine Oil Spot", severity: "major" },
  { id: "reed_mark", label: "Reed Dent / Spacing Mark", severity: "major" },
  { id: "float", label: "Weave Float / Stitch Fault", severity: "major" },
  { id: "selvedge", label: "Broken / Loose Selvedge", severity: "minor" }
];

// Registered Operators
export const OPERATOR_ROSTER = [
  { id: "OP-401", name: "Ramesh Kumar", shed: "SHED-A", role: "Weaver" },
  { id: "OP-402", name: "Suresh Patil", shed: "SHED-A", role: "Weaver" },
  { id: "OP-403", name: "Aditya Sharma", shed: "SHED-A", role: "Loom Master / Supervisor" },
  { id: "OP-482", name: "Manoj Verma", shed: "SHED-A", role: "Senior Weaver" },
  { id: "OP-501", name: "Kishore Naik", shed: "SHED-B", role: "Weaver" },
  { id: "OP-502", name: "Gopal Swamy", shed: "SHED-B", role: "Loom Technician" }
];

// Shifts
export const SHIFT_SCHEDULE = [
  { code: "A", name: "Shift 1 (Morning)", hours: 8, start: "07:00", end: "15:00" },
  { code: "B", name: "Shift 2 (Evening)", hours: 8, start: "15:00", end: "23:00" },
  { code: "C", name: "Shift 3 (Night)", hours: 8, start: "23:00", end: "07:00" }
];
