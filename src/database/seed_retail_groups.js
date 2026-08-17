const { getDb, saveDb } = require('./schema');

const RETAIL_GROUPS = [
  // =========================================================================
  // 1. CIGARETTES - PHILIP MORRIS / ALTRIA
  // =========================================================================
  {
    name: "Marlboro - Regular Packs",
    description: "Philip Morris Marlboro Red, Gold, Silver, 72s, 83s, 27s Standard Packs ($12.29)",
    category: "Cigarettes",
    dept_names: ["Cigs"],
    include_patterns: [/marl.*(red|gold|silver|72|83|27|full flavor|blend no|label)/i, /^marlboro (king|100)/i],
    exclude_patterns: [/carton/i, /menthol/i, /special/i, /cowboy/i, /smooth/i, /nxt/i, /blend/i],
    max_price: 20.0
  },
  {
    name: "Marlboro - Regular Cartons",
    description: "Philip Morris Marlboro Red, Gold, Silver, 72s, 83s, 27s Cartons ($129.90)",
    category: "Cigarettes",
    dept_names: ["Cigs", "Cig Cartons"],
    include_patterns: [/marl.*(red|gold|silver|72|83|27|full flavor|blend no|label).*(carton|box|king|100)/i, /marlboro.*carton/i],
    exclude_patterns: [/menthol/i, /special/i, /cowboy/i, /smooth/i, /nxt/i],
    min_price: 50.0
  },
  {
    name: "Marlboro - Menthol Packs",
    description: "Philip Morris Marlboro Menthol, Menthol Gold, Menthol Silver, Smooth, NXT Packs ($12.29)",
    category: "Cigarettes",
    dept_names: ["Cigs"],
    include_patterns: [/marl.*(menthol|smooth|nxt|green)/i],
    exclude_patterns: [/carton/i, /special/i],
    max_price: 20.0
  },
  {
    name: "Marlboro - Menthol Cartons",
    description: "Philip Morris Marlboro Menthol, Menthol Gold, Menthol Silver, Smooth, NXT Cartons ($129.90)",
    category: "Cigarettes",
    dept_names: ["Cigs", "Cig Cartons"],
    include_patterns: [/marl.*(menthol|smooth|nxt|green).*(carton|box|king|100)/i, /marlboro.*menthol.*carton/i],
    exclude_patterns: [/special/i],
    min_price: 50.0
  },
  {
    name: "Marlboro - Special Select Packs",
    description: "Philip Morris Marlboro Special Select & Special Blend Packs - Black, Gold, Red ($10.59)",
    category: "Cigarettes",
    dept_names: ["Cigs"],
    include_patterns: [/marl.*(special select|special blend)/i],
    exclude_patterns: [/carton/i],
    max_price: 20.0
  },
  {
    name: "Marlboro - Special Select Cartons",
    description: "Philip Morris Marlboro Special Select & Special Blend Cartons ($114.99 / $127.90)",
    category: "Cigarettes",
    dept_names: ["Cigs", "Cig Cartons"],
    include_patterns: [/marl.*(special select|special blend).*(carton|box|king|100)/i, /marlboro special.*carton/i],
    min_price: 50.0
  },
  {
    name: "Marlboro - Cowboy Cut",
    description: "Philip Morris Marlboro Cowboy Cut Line ($8.49)",
    category: "Cigarettes",
    dept_names: ["Cigs"],
    include_patterns: [/marlboro.*cowboy cut/i, /marl.*cc.*box/i],
    exclude_patterns: [/carton/i]
  },
  {
    name: "Parliament - Packs",
    description: "Philip Morris Parliament Blue & White Kings & 100s Packs ($12.99)",
    category: "Cigarettes",
    dept_names: ["Cigs"],
    include_patterns: [/parliament/i],
    exclude_patterns: [/carton/i],
    max_price: 20.0
  },
  {
    name: "Parliament - Cartons",
    description: "Philip Morris Parliament Kings & 100s Cartons ($150.00)",
    category: "Cigarettes",
    dept_names: ["Cigs", "Cig Cartons"],
    include_patterns: [/parliament.*(carton|box|king)/i],
    min_price: 50.0
  },
  {
    name: "L&M - Packs",
    description: "Philip Morris L&M Red, Blue, Menthol Kings & 100s Packs ($11.99)",
    category: "Cigarettes",
    dept_names: ["Cigs"],
    include_patterns: [/(l\s*(&|and)?\s*m\b|land m\b)/i],
    exclude_patterns: [/carton/i],
    max_price: 20.0
  },
  {
    name: "L&M - Cartons",
    description: "Philip Morris L&M Red, Blue, Menthol Kings & 100s Cartons ($114.90)",
    category: "Cigarettes",
    dept_names: ["Cigs", "Cig Cartons"],
    include_patterns: [/(l\s*(&|and)?\s*m\b|land m\b).*(carton|box|king|100)/i],
    min_price: 50.0
  },
  {
    name: "Basic - Packs",
    description: "Philip Morris Basic Gold & Red Kings & 100s Packs ($10.49)",
    category: "Cigarettes",
    dept_names: ["Cigs"],
    include_patterns: [/^basic\b/i],
    exclude_patterns: [/carton/i],
    max_price: 20.0
  },
  {
    name: "Basic - Cartons",
    description: "Philip Morris Basic Gold & Red Cartons ($104.90)",
    category: "Cigarettes",
    dept_names: ["Cigs", "Cig Cartons"],
    include_patterns: [/^basic.*(carton|box)/i],
    min_price: 50.0
  },

  // =========================================================================
  // 2. CIGARETTES - RJ REYNOLDS (BAT)
  // =========================================================================
  {
    name: "Newport - Menthol Packs",
    description: "RJ Reynolds Newport Menthol Kings, 100s, Gold, Blue Packs ($12.99)",
    category: "Cigarettes",
    dept_names: ["Cigs"],
    include_patterns: [/newport.*(menthol|gold|blue|soft|king|100)/i, /^newport\b/i],
    exclude_patterns: [/carton/i, /red/i, /non-menthol/i],
    max_price: 20.0
  },
  {
    name: "Newport - Menthol Cartons",
    description: "RJ Reynolds Newport Menthol Kings, 100s, Gold, Blue Cartons ($119.99)",
    category: "Cigarettes",
    dept_names: ["Cigs", "Cig Cartons"],
    include_patterns: [/newport.*(menthol|gold|blue|soft|king|100).*(carton|box)/i, /newport.*carton/i],
    exclude_patterns: [/red/i],
    min_price: 50.0
  },
  {
    name: "Newport - Red / Non-Menthol Packs",
    description: "RJ Reynolds Newport Non-Menthol Red Kings & 100s Packs ($12.99)",
    category: "Cigarettes",
    dept_names: ["Cigs"],
    include_patterns: [/newport.*red/i],
    exclude_patterns: [/carton/i],
    max_price: 20.0
  },
  {
    name: "Newport - Red / Non-Menthol Cartons",
    description: "RJ Reynolds Newport Non-Menthol Red Kings & 100s Cartons ($113.99)",
    category: "Cigarettes",
    dept_names: ["Cigs", "Cig Cartons"],
    include_patterns: [/newport.*red.*(carton|box)/i],
    min_price: 50.0
  },
  {
    name: "Camel - Regular Packs",
    description: "RJ Reynolds Camel Filters, Blue, 99s, Silver, Royal Packs ($11.19)",
    category: "Cigarettes",
    dept_names: ["Cigs"],
    include_patterns: [/camel.*(99|blue|filter|silver|royal|king)/i, /^camel\b/i],
    exclude_patterns: [/carton/i, /crush/i, /snus/i, /turk/i, /teq/i],
    max_price: 20.0
  },
  {
    name: "Camel - Regular Cartons",
    description: "RJ Reynolds Camel Filters, Blue, 99s, Silver, Royal Cartons ($122.99)",
    category: "Cigarettes",
    dept_names: ["Cigs", "Cig Cartons"],
    include_patterns: [/camel.*(99|blue|filter|silver|royal|king).*(carton|box)/i, /camel.*carton/i],
    exclude_patterns: [/crush/i, /snus/i, /turk/i, /teq/i],
    min_price: 50.0
  },
  {
    name: "Camel - Crush & Menthol Packs",
    description: "RJ Reynolds Camel Crush, Crush Menthol, Silver Menthol Packs ($11.19)",
    category: "Cigarettes",
    dept_names: ["Cigs"],
    include_patterns: [/camel.*crush/i],
    exclude_patterns: [/carton/i],
    max_price: 20.0
  },
  {
    name: "Camel - Crush & Menthol Cartons",
    description: "RJ Reynolds Camel Crush, Crush Menthol, Silver Menthol Cartons ($122.99)",
    category: "Cigarettes",
    dept_names: ["Cigs", "Cig Cartons"],
    include_patterns: [/camel.*crush.*(carton|box)/i],
    min_price: 50.0
  },
  {
    name: "Camel - Turkish Line",
    description: "RJ Reynolds Camel Turkish Silver, Royal, Gold Line ($12.99 / $122.99)",
    category: "Cigarettes",
    dept_names: ["Cigs", "Cig Cartons"],
    include_patterns: [/camel.*turk/i]
  },
  {
    name: "Pall Mall - Classic Packs",
    description: "RJ Reynolds Pall Mall Red, Blue, Orange, Menthol Black, Menthol White Packs ($10.99)",
    category: "Cigarettes",
    dept_names: ["Cigs"],
    include_patterns: [/pall mall.*(red|blue|orange|menthol|green|black|white|full flavor)/i, /^pall mall\b/i],
    exclude_patterns: [/carton/i, /select/i],
    max_price: 20.0
  },
  {
    name: "Pall Mall - Classic Cartons",
    description: "RJ Reynolds Pall Mall Red, Blue, Orange, Menthol Black, Menthol White Cartons ($109.90)",
    category: "Cigarettes",
    dept_names: ["Cigs", "Cig Cartons"],
    include_patterns: [/pall mall.*(red|blue|orange|menthol|green|black|white|full flavor).*(carton|box)/i, /pall mall.*carton/i],
    exclude_patterns: [/select/i],
    min_price: 50.0
  },
  {
    name: "Pall Mall - Select Line",
    description: "RJ Reynolds Pall Mall Select Blue, Red, Green Packs ($8.02)",
    category: "Cigarettes",
    dept_names: ["Cigs"],
    include_patterns: [/pall mall.*select/i]
  },
  {
    name: "American Spirit - Packs",
    description: "RJ Reynolds Natural American Spirit Blue, Yellow, Green, Turquoise, Organic Packs ($13.49)",
    category: "Cigarettes",
    dept_names: ["Cigs"],
    include_patterns: [/american spirit/i],
    exclude_patterns: [/carton/i],
    max_price: 20.0
  },
  {
    name: "American Spirit - Cartons",
    description: "RJ Reynolds Natural American Spirit Cartons ($133.99)",
    category: "Cigarettes",
    dept_names: ["Cigs", "Cig Cartons"],
    include_patterns: [/american spirit.*(carton|box)/i],
    min_price: 50.0
  },
  {
    name: "Lucky Strike - Line",
    description: "RJ Reynolds Lucky Strike Red, Gold, Menthol, Silver Line ($8.81)",
    category: "Cigarettes",
    dept_names: ["Cigs"],
    include_patterns: [/lucky (strike|gold|menthol|red)/i]
  },
  {
    name: "Misty 120s - Line",
    description: "RJ Reynolds Misty Blue, Menthol Green, Silver 120s Line ($14.99 / $140.00)",
    category: "Cigarettes",
    dept_names: ["Cigs", "Cig Cartons"],
    include_patterns: [/misty.*(blue|menthol|silver|120)/i]
  },

  // =========================================================================
  // 3. CIGARETTES - ITG BRANDS (IMPERIAL)
  // =========================================================================
  {
    name: "Winston - Packs",
    description: "ITG Brands Winston Red, Gold, Full Flavor Kings & 100s Packs ($11.49)",
    category: "Cigarettes",
    dept_names: ["Cigs"],
    include_patterns: [/winston/i],
    exclude_patterns: [/carton/i],
    max_price: 20.0
  },
  {
    name: "Winston - Cartons",
    description: "ITG Brands Winston Red, Gold, Full Flavor Kings & 100s Cartons ($114.90)",
    category: "Cigarettes",
    dept_names: ["Cigs", "Cig Cartons"],
    include_patterns: [/winston.*(carton|box)/i],
    min_price: 50.0
  },
  {
    name: "Kool - Packs & Cartons",
    description: "ITG Brands Kool Menthol Green Kings & 100s Line ($10.79-$12.49 / $107.90)",
    category: "Cigarettes",
    dept_names: ["Cigs", "Cig Cartons"],
    include_patterns: [/kool/i]
  },
  {
    name: "Salem - Line",
    description: "ITG Brands Salem Menthol Gold & Slim 100s Line ($13.49 / $129.90)",
    category: "Cigarettes",
    dept_names: ["Cigs", "Cig Cartons"],
    include_patterns: [/salem/i]
  },
  {
    name: "Maverick - Line",
    description: "ITG Brands Maverick Menthol & Gold Line ($10.99)",
    category: "Cigarettes",
    dept_names: ["Cigs"],
    include_patterns: [/maverick/i]
  },

  // =========================================================================
  // 4. ORAL NICOTINE, SMOKELESS & VAPOR
  // =========================================================================
  {
    name: "ZYN - Nicotine Pouches (Single Can)",
    description: "Swedish Match / Philip Morris ZYN 3mg & 6mg Single Cans ($6.69 / $10.29)",
    category: "Tobacco & Smokeless",
    dept_names: ["Tobacco", "Vapes etc"],
    include_patterns: [/\bzyn\b/i],
    exclude_patterns: [/roll/i, /5pk/i, /brick/i],
    max_price: 15.0
  },
  {
    name: "ZYN - Nicotine Pouches (Multi-Can Roll)",
    description: "Swedish Match / Philip Morris ZYN Multi-can Rolls ($32.95)",
    category: "Tobacco & Smokeless",
    dept_names: ["Tobacco", "Vapes etc"],
    include_patterns: [/\bzyn\b/i],
    min_price: 15.0
  },
  {
    name: "Camel - Snus Line",
    description: "RJ Reynolds Camel Snus Frost, Mellow, Mint, Winterchill ($8.99)",
    category: "Tobacco & Smokeless",
    dept_names: ["Tobacco", "Vapes etc"],
    include_patterns: [/camel.*snus/i]
  },
  {
    name: "Velo - Nicotine Pouches",
    description: "RJ Reynolds Velo Nicotine Pouches ($6.99)",
    category: "Tobacco & Smokeless",
    dept_names: ["Tobacco", "Vapes etc"],
    include_patterns: [/velo/i]
  },
  {
    name: "Vuse Alto - Pods & Devices",
    description: "RJ Reynolds Vuse Alto Pods (2pk, 4pk, 6pk) & Devices ($13.99-$49.99)",
    category: "Tobacco & Smokeless",
    dept_names: ["Tobacco", "Vapes etc", "Cigs"],
    include_patterns: [/vuse/i]
  },
  {
    name: "Juul - Pods & Kits",
    description: "Juul Pods 2pk, 4pk & Device Kits ($13.99-$28.99)",
    category: "Tobacco & Smokeless",
    dept_names: ["Tobacco", "Vapes etc", "Cigs"],
    include_patterns: [/juul/i]
  },

  // =========================================================================
  // 5. CIGARS & CIGARILLOS
  // =========================================================================
  {
    name: "Black & Mild - Singles & Wood Tip",
    description: "John Middleton / Philip Morris Black & Mild Singles & Wood Tips ($1.19-$1.79)",
    category: "Tobacco & Smokeless",
    dept_names: ["Tobacco", "Cigs"],
    include_patterns: [/black and mild/i, /bandm\b/i, /wood tip/i, /middleton/i]
  },
  {
    name: "Backwoods - 5-Packs & Singles",
    description: "ITG Brands Backwoods Honey, Honey Berry, Russian Cream, Sweet Aromatic ($7.99-$8.99)",
    category: "Tobacco & Smokeless",
    dept_names: ["Tobacco", "Cigs"],
    include_patterns: [/backwoods/i, /bkws\b/i]
  },
  {
    name: "Swisher Sweets - Cigarillos & Pouches",
    description: "Swisher Sweets 2-for-99c, 2-for-$1.29, 2-for-$1.49 Foil Pouches ($1.49)",
    category: "Tobacco & Smokeless",
    dept_names: ["Tobacco", "Cigs"],
    include_patterns: [/swisher/i]
  },
  {
    name: "Dutch Masters / Dutch - Cigarillos",
    description: "Imperial Brands Dutch Masters Palma & Foil Pouches ($1.29)",
    category: "Tobacco & Smokeless",
    dept_names: ["Tobacco", "Cigs"],
    include_patterns: [/\bdutch\b/i, /dutch master/i]
  },
  {
    name: "White Owl / 4K - Cigarillos",
    description: "Swedish Match White Owl & 4K Foil Pouches ($1.29)",
    category: "Tobacco & Smokeless",
    dept_names: ["Tobacco"],
    include_patterns: [/white owl/i, /\b4k\b.*grape/i, /\b4k\b.*pineapple/i, /\b4k\b.*berry/i]
  },

  // =========================================================================
  // 6. BEVERAGES - PEPSICO FAMILY
  // =========================================================================
  {
    name: "PepsiCo - 20oz Bottles",
    description: "Pepsi, Diet Pepsi, Pepsi Zero, Wild Cherry, Mountain Dew, Diet Dew, Voltage, Code Red, Starry, Mug 20oz ($2.49-$2.89)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/(pepsi|mountain dew|mt\.?\s*dew|dew\b|starry|mug root).*20\s*oz/i, /20\s*oz.*(pepsi|dew|starry|mug)/i, /cherry pepsi zero/i],
    exclude_patterns: [/12\s*pk/i, /2\s*l/i, /can/i, /aquafina/i, /gatorade/i]
  },
  {
    name: "PepsiCo - 2-Liter Bottles",
    description: "Pepsi, Diet Pepsi, Mountain Dew, Diet Dew, Starry, Mug 2-Liter Bottles ($3.49)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/(pepsi|mountain dew|mt\.?\s*dew|dew\b|starry|mug).*(2\s*l|2\s*ltr|2\s*liter)/i],
    exclude_patterns: [/12\s*pk/i, /20\s*oz/i, /can/i]
  },
  {
    name: "PepsiCo - 1-Liter & 1.5-Liter Bottles",
    description: "Pepsi, Diet Pepsi, Mountain Dew 1-Liter & 1.5-Liter Bottles ($2.49-$2.89)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/(pepsi|mountain dew|mt\.?\s*dew|dew\b).*(1\s*l|1\s*ltr|1\s*liter|1\.5\s*l)/i],
    exclude_patterns: [/2\s*l/i, /12\s*pk/i]
  },
  {
    name: "PepsiCo - 12-Pack Cans",
    description: "Pepsi, Diet Pepsi, Wild Cherry, Mountain Dew, Diet Dew 12-Pack Cans ($8.99)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/(pepsi|mountain dew|mt\.?\s*dew|dew\b|starry|mug).*(12\s*pk|12\s*pack|12pk)/i],
    exclude_patterns: [/20\s*oz/i, /2\s*l/i]
  },
  {
    name: "PepsiCo - 12oz Single Cans",
    description: "Pepsi, Diet Pepsi, Mountain Dew 12oz Single Cans ($0.89)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/(pepsi|mountain dew|mt\.?\s*dew|dew\b).*12\s*oz.*can/i, /cherry pepsi 12 oz/i, /diet pepsi 12oz/i],
    exclude_patterns: [/12\s*pk/i, /20\s*oz/i, /2\s*l/i]
  },
  {
    name: "Gatorade - 28oz & 32oz Bottles",
    description: "PepsiCo Gatorade & Gatorade Zero 28oz & 32oz Sports Drinks ($3.39-$3.49)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/gatorade/i, /gator/i]
  },
  {
    name: "Aquafina - Bottled Water",
    description: "PepsiCo Aquafina Pure Water 20oz, 1L, 24-Pack ($1.69-$6.99)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/aquafina/i]
  },
  {
    name: "Brisk Iced Tea - 1-Liter Bottles",
    description: "PepsiCo Lipton Brisk Lemon, Sweet Tea, Fruit Punch 1-Liter ($1.39-$1.79)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/brisk/i]
  },
  {
    name: "Rockstar / Amp - Energy Drinks",
    description: "PepsiCo Rockstar & Amp 16oz Energy Drinks ($2.49-$2.89)",
    category: "Energy Drinks",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/rockstar/i, /\bamp\b.*(energy|cherry|16)/i]
  },

  // =========================================================================
  // 7. BEVERAGES - COCA-COLA COMPANY FAMILY
  // =========================================================================
  {
    name: "Coca-Cola - 20oz Bottles",
    description: "Coca-Cola, Diet Coke, Coke Zero, Cherry Coke, Vanilla Coke, Sprite, Sprite Zero, Fanta 20oz ($2.69-$2.79)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/(coke|coca-cola|sprite|fanta|barq).*20\s*oz/i, /20\s*oz.*(coke|sprite|fanta)/i, /^coke 20 oz/i, /cherry sprite/i, /coke.*diet 20z/i, /coke cherry diet 20z/i, /coke vanilla 20oz/i],
    exclude_patterns: [/12\s*pk/i, /2\s*l/i, /12\s*oz/i, /can/i]
  },
  {
    name: "Coca-Cola - 2-Liter Bottles",
    description: "Coca-Cola, Diet Coke, Coke Zero, Sprite, Fanta 2-Liter Bottles ($3.49)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/(coke|coca-cola|sprite|fanta|barq).*(2\s*l|2\s*ltr|2\s*liter)/i],
    exclude_patterns: [/12\s*pk/i, /20\s*oz/i]
  },
  {
    name: "Coca-Cola - 12-Pack Cans",
    description: "Coca-Cola, Diet Coke, Coke Zero, Sprite, Fanta 12-Pack Cans ($8.99)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/(coke|coca-cola|sprite|fanta|barq).*(12\s*pk|12\s*pack|12pk|12 packs)/i],
    exclude_patterns: [/20\s*oz/i, /2\s*l/i]
  },
  {
    name: "Coca-Cola - 12oz & 16oz Cans",
    description: "Coca-Cola, Diet Coke, Sprite 12oz Single Cans & 16oz Tall Cans ($0.89 / $1.99)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/(12\s*oz|16\s*oz|16 fl oz|tall).*(coke|coca-cola|sprite)/i, /(coke|sprite).*(12\s*oz|16\s*oz|tall).*can/i, /coke zero tall/i],
    exclude_patterns: [/12\s*pk/i, /20\s*oz/i, /2\s*l/i]
  },
  {
    name: "BodyArmor & Powerade - Sports Drinks",
    description: "Coca-Cola BodyArmor 16oz/28oz, Flash I.V. 20oz & Powerade ($2.69-$3.49)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/body\s*armou?r/i, /powerade/i]
  },
  {
    name: "Dasani & Smartwater - Bottled Water",
    description: "Coca-Cola Dasani & Smartwater Purified Water ($1.69-$2.99)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/dasani/i, /smartwater/i, /smart water/i]
  },
  {
    name: "Core Power - High Protein Shakes",
    description: "Fairlife / Coca-Cola Core Power Elite 14oz Protein Shakes ($3.79)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/core power/i]
  },
  {
    name: "Dunkin Donuts - Iced Coffee Bottles",
    description: "Coca-Cola Dunkin' Donuts Ready-to-Drink Iced Coffee ($3.79)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/dunkin/i]
  },

  // =========================================================================
  // 8. BEVERAGES - KEURIG DR PEPPER FAMILY
  // =========================================================================
  {
    name: "Dr Pepper / 7UP - 20oz Bottles",
    description: "Dr Pepper, Diet DP, DP Zero, Cherry DP, Cream Soda, 7UP, Diet 7UP, Canada Dry, A&W, Sunkist, Crush 20oz ($1.79-$1.89)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/(dr\.?\s*pepper|7\s*[-]?\s*up|canada dry|a&w|sunkist|crush).*20\s*z?/i, /20\s*z?.*(dr\.?\s*pepper|7\s*up|crush)/i],
    exclude_patterns: [/12\s*pk/i, /2\s*l/i, /can/i]
  },
  {
    name: "Dr Pepper / 7UP - 2-Liter Bottles",
    description: "Dr Pepper, Diet DP, 7UP, Canada Dry, A&W, Sunkist 2-Liter Bottles ($2.79-$3.49)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/(dr\.?\s*pepper|7\s*[-]?\s*up|canada dry|a&w|sunkist|crush).*(2\s*l|2\s*ltr|2\s*liter)/i],
    exclude_patterns: [/12\s*pk/i, /20\s*oz/i]
  },
  {
    name: "Dr Pepper / 7UP - 12-Pack Cans",
    description: "Dr Pepper, Diet DP, 7UP, Diet 7UP, Canada Dry, Crush 12-Pack Cans ($6.99-$8.99)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/(dr\.?\s*pepper|7\s*[-]?\s*up|canada dry|a&w|sunkist|crush).*(12\s*pk|12\s*pack|12pk)/i],
    exclude_patterns: [/20\s*oz/i, /2\s*l/i]
  },
  {
    name: "Snapple - Iced Tea & Juice (32oz)",
    description: "Keurig Dr Pepper Snapple 32oz & 16oz Bottles ($3.19)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/snapple/i]
  },

  // =========================================================================
  // 9. ENERGY DRINKS & SPECIALTY BEVERAGES
  // =========================================================================
  {
    name: "Monster Energy - 16oz Cans & Java",
    description: "Monster Energy, Ultra White, Mango Loco, Pipeline Punch & Java Monster 15oz/16oz ($3.39)",
    category: "Energy Drinks",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/monster/i, /java latte/i, /java monster/i]
  },
  {
    name: "Red Bull - Energy Cans",
    description: "Red Bull 8.4oz, 12oz, 16oz, 20oz (Original, Sugarfree, Editions) ($2.99-$5.99)",
    category: "Energy Drinks",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/red\s*bull/i, /redbull/i]
  },
  {
    name: "Celsius - 12oz Energy Cans",
    description: "Celsius Sparkling Orange, Kiwi Guava, Wild Berry, Watermelon, Galaxy Vibe 12oz ($2.79)",
    category: "Energy Drinks",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/celsius/i, /celsiuc/i]
  },
  {
    name: "Bang Energy - 16oz Cans",
    description: "Bang Blue Razz, Black Cherry, Sour Ropes, Cotton Candy 16oz ($2.79-$3.19)",
    category: "Energy Drinks",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/\bbang\b/i]
  },
  {
    name: "C4 Energy - 16oz Cans",
    description: "Nutrabolt C4 Performance Energy 16oz Cans ($3.19)",
    category: "Energy Drinks",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/\bc4\b/i]
  },
  {
    name: "Alani Nu - 12oz Energy Cans",
    description: "Alani Nu Cosmic Stardust, Cherry Slush, Mimosa, Purple Candy 12oz ($2.79)",
    category: "Energy Drinks",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/alani/i]
  },
  {
    name: "5-Hour Energy - 2oz Shots",
    description: "5-Hour Energy Regular & Extra Strength 2oz Shots ($3.49-$3.99)",
    category: "Energy Drinks",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/5\s*hour/i, /5\s*hr/i]
  },
  {
    name: "Arizona Tea - 22oz/23oz Tall Cans",
    description: "Arizona Green Tea, Mucho Mango, Fruit Punch 22oz/23oz Cans ($1.29-$1.69)",
    category: "Beverages",
    dept_names: ["Soda", "Fountain", "Edible"],
    include_patterns: [/arizona/i]
  },

  // =========================================================================
  // 10. SNACKS - FRITO-LAY & CHIPS
  // =========================================================================
  {
    name: "Frito-Lay - Single Serve Bags ($2.49-$2.69)",
    description: "Lay's, Doritos, Cheetos, Fritos, Ruffles, Tostitos Single Serve Bags",
    category: "Snacks",
    dept_names: ["Snacks", "Candy", "Bulk Foods", "Edible"],
    include_patterns: [/lay'?s/i, /doritos/i, /cheetos/i, /fritos/i, /ruffles/i, /tostitos/i],
    max_price: 3.50
  },
  {
    name: "Frito-Lay - Party & Take-Home Bags",
    description: "Lay's, Doritos, Cheetos, Ruffles XL & Party Size Bags ($5.99+)",
    category: "Snacks",
    dept_names: ["Snacks", "Candy", "Bulk Foods", "Edible"],
    include_patterns: [/lay'?s/i, /doritos/i, /cheetos/i, /fritos/i, /ruffles/i, /tostitos/i],
    min_price: 3.51
  },

  // =========================================================================
  // 11. BEER & MALT BEVERAGES
  // =========================================================================
  {
    name: "Domestic Beer - 24oz/25oz Tall Cans",
    description: "Budweiser, Bud Light, Coors Light, Miller Lite, Busch Light, Michelob Ultra, Natty Light 24oz/25oz ($1.89-$2.69)",
    category: "Beer & Malt",
    dept_names: ["Beer", "Liquor"],
    include_patterns: [/(budweiser|bud light|coors|miller|busch|michelob|natty|natural light).*(24\s*oz|25\s*oz|can|single)/i, /24\s*oz.*(bud|coors|miller|busch)/i, /bud light 25/i, /budweiser 25/i, /busch.*25oz/i, /michelob ultra 25/i, /miller lite 24oz/i, /coors light 24oz/i, /natural light 25/i],
    exclude_patterns: [/12\s*pk/i, /6\s*pk/i, /18\s*pk/i, /24\s*pk/i, /30\s*pk/i]
  },
  {
    name: "Flavored Malt & Seltzers - 24oz Cans",
    description: "Twisted Tea, White Claw, Truly, Mike's Hard, Cayman Jack, Surfside, Four Loko 24oz ($1.69-$3.99)",
    category: "Beer & Malt",
    dept_names: ["Beer", "Liquor"],
    include_patterns: [/(twisted tea|white claw|truly|mike'?s|cayman jack|steel reserve|four loko|seagram|surfside).*24\s*oz/i, /24\s*oz.*(tea|claw|truly|four loko|surfside)/i, /twisted.*24oz/i, /mikes.*24oz/i, /four loco 24oz/i, /surfside.*24oz/i]
  },
  {
    name: "Domestic Beer - 12-Pack Cans & Bottles",
    description: "Bud Light, Coors Light, Miller Lite, Michelob Ultra, Busch 12-Packs ($9.99-$14.49)",
    category: "Beer & Malt",
    dept_names: ["Beer", "Liquor"],
    include_patterns: [/(bud|coors|miller|michelob|busch).*(12\s*pk|12\s*pack|12pk|12\/12|12pack)/i],
    exclude_patterns: [/24\s*oz/i, /25\s*oz/i]
  },
  {
    name: "Import Beer - 12-Pack Bottles & Cans",
    description: "Corona Extra, Modelo Especial, Heineken 12-Packs ($14.79-$17.99)",
    category: "Beer & Malt",
    dept_names: ["Beer", "Liquor"],
    include_patterns: [/(corona|modelo|heineken|pacifico|stella|blue moon).*(12\s*pk|12\s*pack|12pk|12\/12|12pack)/i],
    exclude_patterns: [/24\s*oz/i]
  }
];

function seedRetailGroups(dbInstance) {
  const db = dbInstance || getDb();

  // Ensure category column exists in item_groups
  try {
    const cols = db.pragma('table_info(item_groups)');
    const hasCategory = cols.some(c => c.name === 'category');
    if (!hasCategory) {
      db.prepare("ALTER TABLE item_groups ADD COLUMN category TEXT DEFAULT 'General'").run();
      console.log("[Seed] Added 'category' column to item_groups table");
    }
  } catch (e) {
    console.warn("[Seed] Column check warning:", e.message);
  }

  // Build department name to ID lookup map
  const deptRows = db.prepare('SELECT id, name FROM departments').all();
  const deptMap = {};
  for (const d of deptRows) {
    deptMap[d.name.toLowerCase()] = d.id;
  }

  // Load all items from pricebook
  const items = db.prepare('SELECT id, upc, name, price, cost, department_id FROM pricebook').all();
  console.log(`[Seed] Matching ${items.length} pricebook items against ${RETAIL_GROUPS.length} retail price groups...`);

  // Clear existing groups and links
  db.prepare('DELETE FROM group_items').run();
  db.prepare('DELETE FROM item_groups').run();

  const insertGroupStmt = db.prepare(`
    INSERT INTO item_groups (name, description, category, group_type, condition_type, condition_value, price_adjustment_type, price_adjustment_value)
    VALUES (?, ?, ?, 'retail_rule', 'pattern_match', ?, 'percentage', 0)
  `);
  const insertItemStmt = db.prepare('INSERT OR IGNORE INTO group_items (group_id, pricebook_id) VALUES (?, ?)');

  let totalGroupsCreated = 0;
  let totalItemsAssigned = 0;

  const runSeeding = db.transaction(() => {
    for (const g of RETAIL_GROUPS) {
      const res = insertGroupStmt.run(g.name, g.description, g.category || 'General', g.name);
      const groupId = res.lastInsertRowid;
      totalGroupsCreated++;

      // Resolve allowed department IDs dynamically
      let allowedDeptIds = null;
      if (g.dept_names && g.dept_names.length > 0) {
        allowedDeptIds = g.dept_names
          .map(name => deptMap[name.toLowerCase()])
          .filter(id => id !== undefined);
      }

      let matchedCount = 0;
      for (const item of items) {
        // Department filter
        if (allowedDeptIds && allowedDeptIds.length > 0 && !allowedDeptIds.includes(item.department_id)) {
          continue;
        }

        // Price filter
        const price = item.price || 0;
        if (g.min_price !== undefined && price < g.min_price) continue;
        if (g.max_price !== undefined && price > g.max_price) continue;

        // Pattern matching
        const name = (item.name || '').trim();
        let incMatch = false;
        for (const pat of g.include_patterns) {
          if (pat.test(name)) {
            incMatch = true;
            break;
          }
        }
        if (!incMatch) continue;

        let excMatch = false;
        if (g.exclude_patterns) {
          for (const pat of g.exclude_patterns) {
            if (pat.test(name)) {
              excMatch = true;
              break;
            }
          }
        }
        if (excMatch) continue;

        insertItemStmt.run(groupId, item.id);
        matchedCount++;
        totalItemsAssigned++;
      }
    }
  });

  runSeeding();
  saveDb();

  console.log(`[Seed] ✅ Created ${totalGroupsCreated} Retail Groups with ${totalItemsAssigned} linked items!`);
  return { groupsCreated: totalGroupsCreated, itemsAssigned: totalItemsAssigned };
}

module.exports = { seedRetailGroups, RETAIL_GROUPS };
