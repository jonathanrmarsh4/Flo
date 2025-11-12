export interface BiomarkerInsight {
  lifestyle: string[];
  nutrition: string[];
  supplementation: string[];
  medicalReferral?: string;
}

export const BIOMARKER_INSIGHTS: Record<string, BiomarkerInsight> = {
  'Glucose': {
    lifestyle: [
      'Engage in 150+ minutes of moderate exercise weekly',
      'Practice stress reduction through meditation or yoga',
      'Prioritize 7-9 hours of quality sleep each night',
      'Avoid prolonged sitting - take movement breaks every hour'
    ],
    nutrition: [
      'Choose low glycemic index foods (whole grains, legumes)',
      'Increase fiber intake to 25-30g daily',
      'Limit refined sugars and processed carbohydrates',
      'Eat protein with every meal to stabilize blood sugar'
    ],
    supplementation: [
      'Chromium picolinate (200-400mcg) - supports insulin sensitivity',
      'Berberine (500mg 2-3x/day) - comparable to metformin',
      'Alpha-lipoic acid (600mg daily) - improves glucose uptake',
      'Magnesium glycinate (400mg) - essential for glucose metabolism'
    ],
    medicalReferral: 'If glucose remains >126 mg/dL fasting or shows upward trend, consult an endocrinologist or primary care physician for diabetes screening (HbA1c test).'
  },
  
  'Cholesterol': {
    lifestyle: [
      'Incorporate aerobic exercise 30 minutes daily',
      'Quit smoking - significantly raises HDL cholesterol',
      'Maintain healthy body weight (BMI 18.5-24.9)',
      'Limit alcohol to moderate levels (1-2 drinks/day max)'
    ],
    nutrition: [
      'Increase soluble fiber (oats, beans, apples)',
      'Add omega-3 rich foods (fatty fish, flaxseeds, walnuts)',
      'Choose plant sterols/stanols (fortified foods)',
      'Limit saturated fat to <7% of total calories'
    ],
    supplementation: [
      'Red yeast rice (1200mg 2x/day) - natural statin alternative',
      'Plant sterols (2g daily) - blocks cholesterol absorption',
      'Omega-3 fish oil (2-4g EPA/DHA daily)',
      'Niacin (B3) - 500mg daily (consult doctor for higher doses)'
    ],
    medicalReferral: 'If total cholesterol >240 mg/dL or LDL >160 mg/dL, especially with family history of heart disease, see a cardiologist for cardiovascular risk assessment.'
  },
  
  'Vitamin D': {
    lifestyle: [
      'Get 15-20 minutes of midday sun exposure (without sunscreen) on arms and legs',
      'Spend more time outdoors during daylight hours',
      'Consider light therapy during winter months',
      'Exercise outdoors when possible'
    ],
    nutrition: [
      'Consume fatty fish (salmon, mackerel, sardines) 2-3x weekly',
      'Include fortified dairy or plant-based milk alternatives',
      'Eat egg yolks (vitamin D is in the yolk)',
      'Consider UV-exposed mushrooms as plant-based source'
    ],
    supplementation: [
      'Vitamin D3 (cholecalciferol) 2000-5000 IU daily',
      'Take with a fat-containing meal for better absorption',
      'Pair with vitamin K2 (100-200mcg) for optimal calcium metabolism',
      'Magnesium (300-400mg) - required for vitamin D activation'
    ],
    medicalReferral: 'If levels <20 ng/mL (deficiency) or not improving with supplementation, consult physician to rule out malabsorption or other underlying conditions.'
  },
  
  'Hemoglobin': {
    lifestyle: [
      'Avoid excessive endurance exercise if levels are low',
      'Stay well-hydrated (affects blood viscosity)',
      'Consider altitude training if levels are borderline low',
      'Manage any chronic bleeding (heavy periods, GI issues)'
    ],
    nutrition: [
      'Increase heme iron sources (red meat, organ meats, shellfish)',
      'Combine non-heme iron with vitamin C for better absorption',
      'Cook in cast iron cookware',
      'Avoid tea/coffee with iron-rich meals (inhibits absorption)'
    ],
    supplementation: [
      'Iron bisglycinate (25-50mg elemental iron) - gentle on stomach',
      'Vitamin C (500mg) - take with iron for enhanced absorption',
      'Vitamin B12 (1000mcg methylcobalamin)',
      'Folate (400-800mcg methylfolate)'
    ],
    medicalReferral: 'If hemoglobin <12 g/dL (women) or <13 g/dL (men), or experiencing fatigue, shortness of breath, see a hematologist to investigate for anemia causes.'
  },
  
  'ALT': {
    lifestyle: [
      'Limit or eliminate alcohol consumption',
      'Achieve and maintain healthy weight (lose 5-10% if overweight)',
      'Exercise regularly (especially resistance training)',
      'Avoid unnecessary medications and supplements stressing the liver'
    ],
    nutrition: [
      'Follow Mediterranean diet pattern',
      'Reduce fructose and added sugars',
      'Increase cruciferous vegetables (broccoli, cauliflower)',
      'Avoid trans fats and limit saturated fats'
    ],
    supplementation: [
      'Milk thistle (silymarin) 200-400mg 3x/day - liver protective',
      'N-acetylcysteine (NAC) 600mg 2x/day - glutathione precursor',
      'Vitamin E (400-800 IU) - for NAFLD only under medical supervision',
      'Omega-3 fish oil (2-3g daily)'
    ],
    medicalReferral: 'If ALT >2x upper limit of normal (>112 U/L) or persistently elevated, consult hepatologist or gastroenterologist for comprehensive liver function testing and imaging.'
  },
  
  'Creatinine': {
    lifestyle: [
      'Stay well-hydrated - drink 8-10 glasses water daily',
      'Monitor and control blood pressure',
      'Avoid NSAIDs (ibuprofen, naproxen) if levels elevated',
      'Limit high-intensity exercise before testing'
    ],
    nutrition: [
      'Moderate protein intake (0.8-1.0g per kg body weight)',
      'Reduce sodium to <2300mg daily',
      'Limit phosphorus-rich foods if levels high',
      'Ensure adequate but not excessive hydration'
    ],
    supplementation: [
      'CoQ10 (100-200mg) - supports mitochondrial function',
      'Alpha-lipoic acid (600mg) - antioxidant support',
      'Avoid creatine supplements if levels elevated',
      'Consult doctor before taking any new supplements'
    ],
    medicalReferral: 'If creatinine >1.3 mg/dL or eGFR <60 mL/min, or rapidly rising levels, see a nephrologist immediately for kidney function assessment and prevent progression.'
  },
  
  'Triglycerides': {
    lifestyle: [
      'Engage in regular aerobic exercise (150 min/week minimum)',
      'Lose excess weight (even 5-10% helps significantly)',
      'Quit smoking',
      'Limit alcohol consumption (especially if levels very high)'
    ],
    nutrition: [
      'Drastically reduce added sugars and refined carbs',
      'Choose complex carbs with fiber (whole grains, legumes)',
      'Increase omega-3 fatty acids from fish',
      'Limit fructose (including fruit juice)'
    ],
    supplementation: [
      'Omega-3 fish oil (2-4g EPA/DHA daily) - proven to lower triglycerides',
      'Niacin (B3) under medical supervision',
      'Berberine (500mg 3x/day)',
      'Curcumin (500-1000mg 2x/day)'
    ],
    medicalReferral: 'If triglycerides >500 mg/dL (pancreatitis risk) or >200 mg/dL with other risk factors, consult cardiologist or lipid specialist for potential medication therapy.'
  },
  
  'HbA1c': {
    lifestyle: [
      'Implement consistent meal timing (don\'t skip meals)',
      'Combine strength training with cardio exercise',
      'Monitor blood glucose if prediabetic/diabetic',
      'Manage stress (cortisol elevates blood sugar)'
    ],
    nutrition: [
      'Follow low glycemic diet consistently',
      'Increase cinnamon consumption (1-2 tsp daily)',
      'Eat more non-starchy vegetables',
      'Balance macros at each meal (protein, fat, fiber with carbs)'
    ],
    supplementation: [
      'Berberine (500mg 3x/day with meals)',
      'Chromium (200-400mcg)',
      'Cinnamon extract (500mg 2x/day)',
      'Alpha-lipoic acid (300-600mg daily)'
    ],
    medicalReferral: 'If HbA1c ≥6.5% (diabetes range) or 5.7-6.4% (prediabetes) with other risk factors, see endocrinologist for comprehensive diabetes management plan.'
  },
  
  'Testosterone': {
    lifestyle: [
      'Prioritize strength training 3-4x weekly',
      'Ensure 7-9 hours quality sleep (testosterone peaks during sleep)',
      'Reduce chronic stress and cortisol',
      'Optimize body composition (reduce excess body fat)'
    ],
    nutrition: [
      'Don\'t severely restrict calories or fat',
      'Consume adequate zinc (oysters, beef, pumpkin seeds)',
      'Include healthy fats (avocado, olive oil, nuts)',
      'Maintain adequate protein intake (0.8-1g per lb body weight)'
    ],
    supplementation: [
      'Vitamin D3 (2000-5000 IU) - strongly correlated with testosterone',
      'Zinc (25-50mg) with copper (2-3mg)',
      'Magnesium (400-500mg)',
      'Ashwagandha (300-500mg 2x/day) - shown to boost testosterone'
    ],
    medicalReferral: 'If total testosterone <300 ng/dL with symptoms (fatigue, low libido, muscle loss), consult urologist or endocrinologist for hormone replacement therapy evaluation.'
  },
  
  'TSH': {
    lifestyle: [
      'Manage stress (affects thyroid function)',
      'Get adequate sleep (7-9 hours)',
      'Avoid excessive soy consumption if hypothyroid',
      'Regular moderate exercise (avoid overtraining)'
    ],
    nutrition: [
      'Ensure adequate iodine (seaweed, iodized salt, fish)',
      'Consume selenium-rich foods (Brazil nuts, fish)',
      'Eat zinc-rich foods (oysters, beef, pumpkin seeds)',
      'Consider gluten-free if Hashimoto\'s thyroiditis'
    ],
    supplementation: [
      'Selenium (200mcg) - supports thyroid hormone conversion',
      'Zinc (25mg)',
      'Vitamin D (if deficient)',
      'Iron (if deficient) - required for thyroid hormone synthesis'
    ],
    medicalReferral: 'If TSH >4.5 mIU/L (especially with symptoms like fatigue, weight gain, cold intolerance) or <0.5 mIU/L, see endocrinologist for full thyroid panel and treatment.'
  },
  
  'Ferritin': {
    lifestyle: [
      'Women: Address heavy menstrual bleeding with gynecologist',
      'Investigate and treat any sources of chronic bleeding',
      'Donate blood less frequently if levels are borderline',
      'Avoid excessive endurance exercise if levels low'
    ],
    nutrition: [
      'Increase heme iron (red meat, liver, oysters)',
      'Pair iron-rich foods with vitamin C',
      'Avoid calcium supplements with iron-rich meals',
      'Limit tea and coffee around meal times'
    ],
    supplementation: [
      'Iron bisglycinate (25-50mg elemental) - best absorbed, gentle',
      'Vitamin C (500mg) with iron',
      'Avoid taking with calcium, zinc, or magnesium',
      'Take on empty stomach if tolerated'
    ],
    medicalReferral: 'If ferritin <30 ng/mL or >300 ng/mL, or not responding to supplementation, see hematologist to rule out iron deficiency anemia or hemochromatosis.'
  },
  
  'hs-CRP': {
    lifestyle: [
      'Engage in regular moderate exercise (reduces inflammation)',
      'Lose excess weight (fat tissue produces inflammatory markers)',
      'Quit smoking immediately',
      'Improve sleep quality and duration'
    ],
    nutrition: [
      'Follow anti-inflammatory diet (Mediterranean)',
      'Increase omega-3 fatty fish consumption',
      'Eat colorful fruits and vegetables (antioxidants)',
      'Reduce processed foods, sugar, and trans fats'
    ],
    supplementation: [
      'Omega-3 fish oil (2-3g EPA/DHA daily)',
      'Curcumin (500mg 2x/day with black pepper)',
      'Vitamin D (if deficient)',
      'Resveratrol (250-500mg)'
    ],
    medicalReferral: 'If hs-CRP >3 mg/L, especially with other cardiac risk factors, consult cardiologist for comprehensive cardiovascular risk assessment and potential imaging.'
  },

  'B12': {
    lifestyle: [
      'If vegan/vegetarian, ensure regular supplementation',
      'Limit alcohol (impairs B12 absorption)',
      'Review medications (PPIs, metformin reduce B12)',
      'Consider methylation issues if not responding to standard B12'
    ],
    nutrition: [
      'Include animal products (meat, fish, eggs, dairy)',
      'Eat fortified nutritional yeast if plant-based',
      'Consume B12-fortified plant milks and cereals',
      'Include clams, liver, and sardines (highest sources)'
    ],
    supplementation: [
      'Methylcobalamin (1000-2000mcg sublingual daily)',
      'B-complex for comprehensive B-vitamin support',
      'Consider B12 injections if malabsorption suspected',
      'Higher doses (2000mcg+) if deficient'
    ],
    medicalReferral: 'If B12 <200 pg/mL with neurological symptoms (tingling, numbness, memory issues) or macrocytic anemia, see neurologist or hematologist immediately.'
  },

  'Cortisol': {
    lifestyle: [
      'Practice stress management daily (meditation, deep breathing)',
      'Maintain regular sleep schedule (cortisol follows circadian rhythm)',
      'Reduce caffeine, especially afternoon/evening',
      'Include relaxation activities (yoga, tai chi, nature walks)'
    ],
    nutrition: [
      'Avoid excessive caffeine (stimulates cortisol)',
      'Eat regular balanced meals (blood sugar affects cortisol)',
      'Include adaptogenic foods (licorice root, holy basil)',
      'Limit alcohol and refined sugars'
    ],
    supplementation: [
      'Ashwagandha (300-500mg 2x/day) - cortisol-lowering adaptogen',
      'Phosphatidylserine (300-400mg) - shown to reduce cortisol',
      'Rhodiola rosea (200-400mg) - stress adaptation',
      'Magnesium glycinate (400mg before bed) - calming'
    ],
    medicalReferral: 'If cortisol consistently >25 μg/dL (Cushing\'s risk) or <5 μg/dL (adrenal insufficiency risk), see endocrinologist for comprehensive adrenal function testing.'
  },

  'Insulin': {
    lifestyle: [
      'Practice intermittent fasting (12-16 hour overnight fast)',
      'Engage in HIIT or resistance training',
      'Reduce sedentary time (insulin sensitivity improves with movement)',
      'Prioritize sleep quality (poor sleep increases insulin resistance)'
    ],
    nutrition: [
      'Adopt low-carb or ketogenic approach if insulin resistant',
      'Increase fiber intake (slows glucose absorption)',
      'Choose low glycemic foods',
      'Avoid frequent snacking (constant insulin release)'
    ],
    supplementation: [
      'Berberine (500mg 3x/day) - improves insulin sensitivity',
      'Chromium (200-400mcg)',
      'Alpha-lipoic acid (600mg)',
      'Inositol (2-4g daily) - especially for PCOS'
    ],
    medicalReferral: 'If fasting insulin >20 μIU/mL or signs of metabolic syndrome, consult endocrinologist for insulin resistance evaluation and potential metformin therapy.'
  },

  'Magnesium': {
    lifestyle: [
      'Reduce alcohol consumption (depletes magnesium)',
      'Manage stress (stress depletes magnesium)',
      'Consider Epsom salt baths (transdermal magnesium)',
      'Avoid excessive sweating without electrolyte replacement'
    ],
    nutrition: [
      'Increase dark leafy greens (spinach, Swiss chard)',
      'Eat nuts and seeds (pumpkin seeds, almonds)',
      'Include whole grains and legumes',
      'Consume dark chocolate (70%+ cacao)'
    ],
    supplementation: [
      'Magnesium glycinate (400-500mg) - best absorbed, gentle',
      'Or magnesium threonate for cognitive benefits',
      'Avoid magnesium oxide (poor absorption)',
      'Split dose (morning and evening) for better tolerance'
    ],
    medicalReferral: 'If serum magnesium <1.7 mg/dL with symptoms (muscle cramps, arrhythmias, tetany), see physician for IV magnesium and comprehensive electrolyte panel.'
  },

  'Hematocrit': {
    lifestyle: [
      'Stay well-hydrated (dehydration falsely elevates)',
      'Live at lower altitude if chronically elevated',
      'If low: address as with hemoglobin recommendations',
      'Regular blood donation if levels persistently high (with doctor approval)'
    ],
    nutrition: [
      'Ensure adequate hydration (8-10 glasses water daily)',
      'If elevated: limit iron-rich foods',
      'If low: follow iron-rich diet recommendations',
      'Maintain balanced diet rich in B-vitamins'
    ],
    supplementation: [
      'If low: iron supplementation (as per hemoglobin)',
      'If high: avoid iron supplements',
      'Vitamin E (400 IU) may help if elevated',
      'Omega-3 fish oil for cardiovascular protection'
    ],
    medicalReferral: 'If hematocrit >50% (men) or >47% (women) - see hematologist to rule out polycythemia vera. If <36% with symptoms, evaluate for anemia.'
  },

  'Calcium': {
    lifestyle: [
      'Engage in weight-bearing exercise (strengthens bones)',
      'Get adequate sunlight for vitamin D (aids calcium absorption)',
      'Limit sodium (high sodium increases calcium excretion)',
      'Avoid excessive caffeine (may reduce calcium absorption)'
    ],
    nutrition: [
      'Consume dairy products (milk, yogurt, cheese) if tolerated',
      'Include calcium-fortified plant milks if dairy-free',
      'Eat leafy greens (collards, kale, bok choy)',
      'Include calcium-set tofu, canned fish with bones'
    ],
    supplementation: [
      'Calcium citrate (500mg 2x/day) - better absorbed than carbonate',
      'Take with vitamin D3 (1000-2000 IU)',
      'Add vitamin K2 (100-200mcg) - directs calcium to bones',
      'Don\'t exceed 2000mg total daily (food + supplements)'
    ],
    medicalReferral: 'If calcium <8.5 mg/dL (hypocalcemia) or >10.5 mg/dL (hypercalcemia), see endocrinologist to evaluate parathyroid function and rule out serious conditions.'
  },

  'ESR': {
    lifestyle: [
      'Identify and treat any infections promptly',
      'Manage autoimmune conditions if diagnosed',
      'Reduce overall inflammation through exercise and weight loss',
      'Quit smoking (elevates ESR)'
    ],
    nutrition: [
      'Follow anti-inflammatory diet (Mediterranean)',
      'Increase omega-3 rich foods',
      'Consume turmeric and ginger regularly',
      'Eliminate potential food sensitivities (common: gluten, dairy)'
    ],
    supplementation: [
      'Omega-3 fish oil (2-3g EPA/DHA)',
      'Curcumin with piperine (500mg 2x/day)',
      'Vitamin D (if deficient)',
      'Probiotics for gut health (50+ billion CFU)'
    ],
    medicalReferral: 'If ESR >20 mm/hr persistently, especially with fever, unexplained weight loss, or joint pain, see rheumatologist to screen for autoimmune disease or chronic infection.'
  },

  'PSA': {
    lifestyle: [
      'Avoid ejaculation 48 hours before testing (falsely elevates)',
      'Avoid vigorous exercise/cycling before test',
      'Maintain healthy weight (obesity linked to prostate issues)',
      'Regular exercise (may reduce prostate cancer risk)'
    ],
    nutrition: [
      'Increase tomato products (lycopene protective)',
      'Eat cruciferous vegetables regularly',
      'Include green tea (catechins protective)',
      'Limit red meat and high-fat dairy'
    ],
    supplementation: [
      'Saw palmetto (160mg 2x/day) - for BPH symptoms',
      'Lycopene (10-30mg) - antioxidant for prostate',
      'Zinc (25-50mg) - important for prostate health',
      'Vitamin D (if deficient) - protective effect'
    ],
    medicalReferral: 'If PSA >4 ng/mL, rapidly rising PSA (>0.75 ng/mL/year), or elevated PSA density, see urologist immediately for digital rectal exam and possible biopsy.'
  },

  'IGF-1': {
    lifestyle: [
      'Optimize sleep quality (growth hormone peaks during deep sleep)',
      'Engage in high-intensity interval training',
      'Manage stress (chronic stress lowers IGF-1)',
      'Avoid excessive endurance exercise (may lower IGF-1)'
    ],
    nutrition: [
      'Ensure adequate protein intake (1.6-2.2g/kg if exercising)',
      'Don\'t severely restrict calories',
      'Include leucine-rich foods (dairy, meat, legumes)',
      'Maintain adequate micronutrient intake'
    ],
    supplementation: [
      'Vitamin D (if deficient) - correlates with IGF-1',
      'Zinc and magnesium (ZMA formula)',
      'Creatine monohydrate (5g daily)',
      'Consider colostrum (20-60g) - may boost IGF-1'
    ],
    medicalReferral: 'If IGF-1 >307 ng/mL - see endocrinologist to rule out acromegaly/pituitary tumor. If <115 ng/mL with symptoms - evaluate growth hormone deficiency.'
  },

  'Folate': {
    lifestyle: [
      'Limit alcohol consumption (depletes folate)',
      'Review medications (some deplete folate)',
      'If planning pregnancy, ensure optimal levels',
      'Cook vegetables minimally (heat destroys folate)'
    ],
    nutrition: [
      'Increase dark leafy greens (spinach, romaine)',
      'Eat legumes (lentils, chickpeas, black beans)',
      'Include fortified grains and cereals',
      'Consume citrus fruits, avocados, Brussels sprouts'
    ],
    supplementation: [
      'Methylfolate (L-5-MTHF) 400-1000mcg - active form',
      'Avoid folic acid if MTHFR gene variant',
      'B-complex for comprehensive support',
      'Increase to 800mcg if pregnant or planning pregnancy'
    ],
    medicalReferral: 'If folate <2.7 ng/mL with macrocytic anemia or neurological symptoms (often with B12 deficiency), see hematologist for comprehensive evaluation.'
  },

  'Zinc': {
    lifestyle: [
      'Limit alcohol (depletes zinc)',
      'Reduce stress (depletes zinc)',
      'Support immune function during illness',
      'Be aware medications may reduce zinc (PPIs, diuretics)'
    ],
    nutrition: [
      'Eat oysters (highest zinc source)',
      'Include red meat and poultry',
      'Consume pumpkin seeds, cashews, chickpeas',
      'If vegetarian, may need higher intake (phytates reduce absorption)'
    ],
    supplementation: [
      'Zinc picolinate or glycinate (25-50mg)',
      'Take with copper (2-3mg) to prevent deficiency',
      'Don\'t take on empty stomach (nausea)',
      'Don\'t exceed 40mg daily long-term'
    ],
    medicalReferral: 'If zinc <70 μg/dL with symptoms (poor wound healing, hair loss, immune issues), see physician to rule out malabsorption or severe deficiency.'
  },

  'Selenium': {
    lifestyle: [
      'Be aware of soil selenium content in your region',
      'Avoid excessive selenium (toxic >400mcg/day)',
      'Support thyroid health',
      'Maintain antioxidant status'
    ],
    nutrition: [
      'Eat 2-3 Brazil nuts daily (very high selenium)',
      'Include fish (tuna, halibut, sardines)',
      'Consume poultry and eggs',
      'Eat whole grains grown in selenium-rich soil'
    ],
    supplementation: [
      'Selenomethionine 200mcg (if diet insufficient)',
      'Don\'t exceed 400mcg total daily (toxic)',
      'Often included in multivitamins',
      'Brazil nuts may provide adequate selenium (check intake)'
    ],
    medicalReferral: 'If selenium <70 μg/L with thyroid issues or >150 μg/L (toxicity risk - hair loss, nail changes), consult endocrinologist or toxicologist.'
  },

  'ApoB': {
    lifestyle: [
      'Engage in regular aerobic exercise',
      'Achieve and maintain healthy weight',
      'Quit smoking immediately',
      'Reduce alcohol consumption'
    ],
    nutrition: [
      'Follow Mediterranean or DASH diet',
      'Increase soluble fiber (oats, legumes, fruits)',
      'Eat omega-3 rich fish 2-3x weekly',
      'Limit saturated and trans fats'
    ],
    supplementation: [
      'Omega-3 fish oil (2-4g EPA/DHA)',
      'Plant sterols (2g daily)',
      'Psyllium fiber (5-10g daily)',
      'Bergamot extract (500-1000mg) - shown to reduce ApoB'
    ],
    medicalReferral: 'If ApoB >100 mg/dL, especially with family history of premature heart disease, see cardiologist for advanced lipid testing and potential statin therapy.'
  },

  'Homocysteine': {
    lifestyle: [
      'Quit smoking (elevates homocysteine)',
      'Limit alcohol consumption',
      'Regular exercise (lowers homocysteine)',
      'Manage stress'
    ],
    nutrition: [
      'Increase folate-rich foods (leafy greens, legumes)',
      'Consume B12 foods (animal products)',
      'Eat B6-rich foods (poultry, fish, potatoes)',
      'Include betaine-rich beets'
    ],
    supplementation: [
      'Methylfolate (L-5-MTHF) 800-1000mcg',
      'Methylcobalamin B12 (1000mcg)',
      'Pyridoxine B6 (50mg)',
      'TMG/Betaine (500-1000mg) - lowers homocysteine'
    ],
    medicalReferral: 'If homocysteine >15 μmol/L, especially with cardiovascular disease history, see cardiologist or vascular specialist for thrombosis risk and MTHFR testing.'
  },

  'SHBG': {
    lifestyle: [
      'Lose excess weight (obesity lowers SHBG)',
      'Reduce alcohol consumption',
      'Manage insulin resistance',
      'Regular resistance training'
    ],
    nutrition: [
      'Increase fiber intake (raises SHBG)',
      'Reduce simple sugars and refined carbs',
      'Include lignans (flaxseeds)',
      'Moderate protein intake'
    ],
    supplementation: [
      'Vitamin D (if deficient) - may increase SHBG',
      'Fiber supplements (psyllium)',
      'Boron (3-6mg) - may modulate SHBG',
      'Manage supplements that affect hormones carefully'
    ],
    medicalReferral: 'If SHBG <20 nmol/L (may indicate insulin resistance/metabolic syndrome) or >60 nmol/L (may affect hormone availability), consult endocrinologist.'
  },

  'E2': {
    lifestyle: [
      'Maintain healthy body weight (fat produces estrogen)',
      'Limit alcohol (increases estrogen)',
      'Reduce xenoestrogen exposure (plastics, pesticides)',
      'Exercise regularly'
    ],
    nutrition: [
      'Increase cruciferous vegetables (support estrogen metabolism)',
      'Eat organic when possible (reduce pesticide exposure)',
      'Include fiber (binds excess estrogen)',
      'Consume flaxseeds (phytoestrogens)'
    ],
    supplementation: [
      'DIM (200-400mg) - supports healthy estrogen metabolism',
      'Calcium-D-glucarate (500mg) - aids estrogen clearance',
      'Vitamin D (if deficient)',
      'Probiotics (gut health affects estrogen)'
    ],
    medicalReferral: 'If E2 significantly outside range (men >40 pg/mL or women inappropriate for cycle phase), see endocrinologist to rule out hormone-producing tumors or aromatase issues.'
  },

  'LH': {
    lifestyle: [
      'Manage stress (affects HPG axis)',
      'Maintain healthy weight',
      'Avoid endocrine disruptors',
      'Ensure adequate sleep'
    ],
    nutrition: [
      'Ensure adequate calorie and fat intake',
      'Avoid severe caloric restriction',
      'Include zinc-rich foods',
      'Maintain balanced macronutrients'
    ],
    supplementation: [
      'Vitamin D (if deficient)',
      'Zinc (25-50mg)',
      'Maca root (1500-3000mg) - may support LH',
      'Multivitamin for overall support'
    ],
    medicalReferral: 'If LH outside normal range (especially if elevated with low testosterone or low with symptoms), see endocrinologist or reproductive specialist for pituitary evaluation.'
  },

  'FSH': {
    lifestyle: [
      'Manage body weight and composition',
      'Reduce stress on reproductive system',
      'Ensure adequate rest and recovery',
      'Avoid environmental toxins'
    ],
    nutrition: [
      'Maintain adequate nutrition (avoid severe restriction)',
      'Include antioxidant-rich foods',
      'Ensure sufficient healthy fats',
      'Include fertility-supporting nutrients'
    ],
    supplementation: [
      'CoQ10 (200-600mg) - egg/sperm quality',
      'Vitamin D (if deficient)',
      'Omega-3 fish oil',
      'Myo-inositol (especially for PCOS - 2-4g)'
    ],
    medicalReferral: 'If FSH elevated (women >18.1 mIU/mL premenopausal may indicate ovarian reserve decline; men elevated may indicate testicular failure), see reproductive endocrinologist.'
  },

  'DHEA-S': {
    lifestyle: [
      'Manage chronic stress (affects adrenal function)',
      'Prioritize sleep (7-9 hours)',
      'Regular but not excessive exercise',
      'Practice stress-reduction techniques'
    ],
    nutrition: [
      'Ensure adequate healthy fats',
      'Include cholesterol (precursor to hormones)',
      'Avoid excessive caloric restriction',
      'Support adrenal health with nutrients'
    ],
    supplementation: [
      'DHEA supplementation only under medical supervision',
      'Vitamin C (1000-2000mg) - supports adrenal function',
      'Adaptogenic herbs (ashwagandha, rhodiola)',
      'Pantothenic acid (B5) - 500mg for adrenal support'
    ],
    medicalReferral: 'If DHEA-S <80 μg/dL (adrenal insufficiency risk) or >560 μg/dL (possible PCOS or adrenal tumor), see endocrinologist for comprehensive adrenal evaluation.'
  },

  'GGT': {
    lifestyle: [
      'Eliminate or drastically reduce alcohol consumption',
      'Lose excess weight if overweight',
      'Avoid hepatotoxic medications when possible',
      'Regular moderate exercise'
    ],
    nutrition: [
      'Follow liver-supportive diet (cruciferous vegetables)',
      'Reduce sugar and refined carbohydrates',
      'Increase antioxidant-rich foods',
      'Limit saturated and trans fats'
    ],
    supplementation: [
      'Milk thistle (silymarin) 200-400mg 3x/day',
      'N-acetylcysteine (NAC) 600-1200mg daily',
      'Selenium (200mcg)',
      'Vitamin E (natural, under medical guidance)'
    ],
    medicalReferral: 'If GGT >55 U/L, especially if 2-3x elevated or rising, see hepatologist to evaluate for liver disease, bile duct issues, or alcohol-related damage.'
  },

  'ALP': {
    lifestyle: [
      'Ensure adequate vitamin D (affects bone ALP)',
      'Weight-bearing exercise for bone health',
      'Avoid excessive alcohol',
      'Review all medications affecting liver or bones'
    ],
    nutrition: [
      'Ensure adequate calcium and vitamin D intake',
      'Support liver health (as per other liver markers)',
      'Include bone-supporting nutrients',
      'Maintain balanced diet'
    ],
    supplementation: [
      'Vitamin D3 (2000-5000 IU) if deficient',
      'Calcium (1000-1200mg from food + supplements)',
      'Vitamin K2 (100-200mcg) - bone health',
      'Magnesium (400mg)'
    ],
    medicalReferral: 'If ALP >120 U/L or <30 U/L, see physician for liver function tests and bone metabolism evaluation to distinguish liver vs bone origin.'
  },

  'AST': {
    lifestyle: [
      'Limit or eliminate alcohol consumption',
      'Lose weight if overweight (NAFLD prevention)',
      'Avoid unnecessary medications',
      'Regular moderate exercise (not excessive)'
    ],
    nutrition: [
      'Follow Mediterranean diet pattern',
      'Reduce fructose and added sugars',
      'Increase omega-3 fatty acids',
      'Eat antioxidant-rich foods'
    ],
    supplementation: [
      'Milk thistle (200-400mg 3x/day)',
      'N-acetylcysteine (NAC) 600mg 2x/day',
      'Omega-3 fish oil (2-3g daily)',
      'Vitamin E (only under medical supervision for NAFLD)'
    ],
    medicalReferral: 'If AST >40 U/L persistently, especially if AST:ALT ratio >2:1 (suggests alcohol) or with symptoms, see hepatologist for comprehensive liver evaluation.'
  },

  'Bilirubin': {
    lifestyle: [
      'Stay well-hydrated',
      'Avoid fasting (can elevate unconjugated bilirubin)',
      'Limit alcohol consumption',
      'Manage any hemolytic conditions'
    ],
    nutrition: [
      'Eat regular balanced meals',
      'Support liver function with cruciferous vegetables',
      'Include antioxidant-rich foods',
      'Adequate fiber for bile flow'
    ],
    supplementation: [
      'Milk thistle for liver support',
      'Antioxidants (vitamin C, E)',
      'B-complex vitamins',
      'Consider probiotics for gut-liver axis'
    ],
    medicalReferral: 'If total bilirubin >1.2 mg/dL (especially if rising or with jaundice), see hepatologist to differentiate Gilbert syndrome from hepatobiliary disease or hemolysis.'
  },

  'eGFR': {
    lifestyle: [
      'Control blood pressure aggressively (<130/80)',
      'Manage blood sugar if diabetic',
      'Stay well-hydrated but don\'t overhydrate',
      'Avoid NSAIDs (ibuprofen, naproxen)'
    ],
    nutrition: [
      'Limit sodium (<2300mg daily, <1500mg if CKD)',
      'Moderate protein (0.8g/kg if CKD)',
      'Reduce phosphorus if levels high',
      'Monitor potassium intake'
    ],
    supplementation: [
      'CoQ10 (100-200mg) - may protect kidneys',
      'Omega-3 fish oil (2g daily)',
      'Avoid high-dose vitamin C (>500mg) if CKD',
      'Consult nephrologist before any supplements'
    ],
    medicalReferral: 'If eGFR <60 mL/min (CKD stage 3) or rapidly declining, see nephrologist immediately to slow progression and prevent end-stage renal disease.'
  },

  'Urea': {
    lifestyle: [
      'Stay adequately hydrated',
      'Avoid excessive protein intake',
      'Manage any GI bleeding source',
      'Monitor kidney function regularly'
    ],
    nutrition: [
      'Moderate protein intake (don\'t exceed 2g/kg unless athlete)',
      'Ensure adequate hydration with water',
      'Balance macronutrients',
      'Reduce protein if kidney issues present'
    ],
    supplementation: [
      'Generally no specific supplements for urea',
      'Support kidney health (CoQ10, omega-3)',
      'Ensure adequate B-vitamins',
      'Consult doctor before supplements if elevated'
    ],
    medicalReferral: 'If urea >20 mg/dL (BUN >20), especially with elevated creatinine or symptoms (nausea, fatigue), see nephrologist to evaluate kidney function and hydration status.'
  },

  'RBC': {
    lifestyle: [
      'If low: similar to hemoglobin/anemia management',
      'If high: stay well-hydrated, live at lower altitude',
      'Manage chronic conditions affecting RBC production',
      'Regular blood donation if chronically elevated (with approval)'
    ],
    nutrition: [
      'If low: iron-rich foods, B12, folate',
      'If high: ensure adequate hydration',
      'Balanced diet supporting healthy blood production',
      'Avoid excessive iron if elevated'
    ],
    supplementation: [
      'If low: iron, B12, folate as recommended',
      'If high: avoid iron supplements',
      'General multivitamin support',
      'Omega-3 for overall cardiovascular health'
    ],
    medicalReferral: 'If RBC <4.2 M/μL (anemia) or >5.9 M/μL (polycythemia risk), see hematologist for comprehensive blood count evaluation and differential diagnosis.'
  },

  'CK': {
    lifestyle: [
      'Avoid intense exercise 48-72 hours before testing',
      'Allow adequate recovery between workouts',
      'Stay well-hydrated (dehydration raises CK)',
      'Avoid intramuscular injections before testing'
    ],
    nutrition: [
      'Ensure adequate hydration',
      'Include antioxidants to reduce exercise-induced damage',
      'Adequate protein for muscle recovery',
      'Anti-inflammatory foods'
    ],
    supplementation: [
      'Tart cherry juice - reduces exercise-induced muscle damage',
      'Curcumin - anti-inflammatory',
      'CoQ10 (especially if on statins)',
      'Vitamin D if deficient (low D can elevate CK)'
    ],
    medicalReferral: 'If CK >200 U/L without recent exercise, or >1000 U/L (rhabdomyolysis risk), see physician immediately to rule out muscle disease, statins effects, or kidney damage.'
  },

  'LDH': {
    lifestyle: [
      'Manage any underlying tissue damage conditions',
      'Avoid excessive exercise before testing',
      'Stay hydrated',
      'Follow up on any hemolysis or tissue injury'
    ],
    nutrition: [
      'Antioxidant-rich diet',
      'Support overall cellular health',
      'Anti-inflammatory foods',
      'Adequate B-vitamins'
    ],
    supplementation: [
      'Antioxidants (vitamins C and E)',
      'B-complex vitamins',
      'CoQ10 (100-200mg)',
      'Alpha-lipoic acid'
    ],
    medicalReferral: 'If LDH >280 U/L, especially if significantly elevated or with symptoms (unexplained fatigue, organ-specific symptoms), see physician to evaluate for hemolysis, tissue damage, or malignancy.'
  },

  'Lp(a)': {
    lifestyle: [
      'Exercise regularly (may modestly reduce)',
      'Don\'t smoke (amplifies cardiovascular risk)',
      'Manage all other cardiovascular risk factors aggressively',
      'Consider advanced cardiac screening if elevated'
    ],
    nutrition: [
      'Generally not diet-responsive, but follow heart-healthy diet',
      'Reduce saturated and trans fats',
      'Increase omega-3 fatty acids',
      'Mediterranean diet pattern'
    ],
    supplementation: [
      'Niacin (under medical supervision) - may lower Lp(a)',
      'CoQ10 (100-200mg)',
      'Omega-3 fish oil (2-4g EPA/DHA)',
      'Vitamin C (1-3g) - some evidence for lowering Lp(a)'
    ],
    medicalReferral: 'If Lp(a) >30 mg/dL (especially >50 mg/dL), see cardiologist for aggressive cardiovascular risk management and consider advanced therapies (PCSK9 inhibitors, apheresis).'
  }
};
