import { createLogger } from '../utils/logger';

const logger = createLogger('DSLDService');

// NIH Dietary Supplement Label Database (DSLD) API
// Documentation: https://dsld.od.nih.gov/api

const DSLD_API_BASE = 'https://api.ods.od.nih.gov/dsld/v9';

export interface DSLDProduct {
  id: string;
  productName: string;
  brandName: string;
  netContentsNumber?: number;
  netContentsUnit?: string;
  servingSize?: string;
  servingsPerContainer?: string;
  dosageForm?: string;
  upc?: string;
  ingredients: DSLDIngredient[];
  imageUrl?: string;
  targetGroups?: string[];
  statementOfIdentity?: string;
}

export interface DSLDIngredient {
  ingredientName: string;
  amount?: number;
  unit?: string;
  dvPercent?: number;
}

export interface DSLDSearchResult {
  products: DSLDProduct[];
  totalCount: number;
}

// Map DSLD product to our supplement types
const INGREDIENT_TO_SUPPLEMENT_TYPE: Record<string, string[]> = {
  'magnesium': ['magnesium', 'magnesium glycinate', 'magnesium citrate', 'magnesium oxide', 'magnesium malate'],
  'vitamin-d3': ['vitamin d', 'vitamin d3', 'cholecalciferol'],
  'omega-3': ['omega-3', 'fish oil', 'epa', 'dha', 'omega 3', 'fish body oil'],
  'l-theanine': ['l-theanine', 'theanine'],
  'ashwagandha': ['ashwagandha', 'withania somnifera', 'ksm-66', 'ksm66'],
  'creatine': ['creatine', 'creatine monohydrate'],
  'melatonin': ['melatonin'],
  'coq10': ['coenzyme q10', 'coq10', 'ubiquinone', 'ubiquinol'],
  'curcumin': ['curcumin', 'turmeric', 'curcuma longa'],
  'berberine': ['berberine'],
  'rhodiola': ['rhodiola', 'rhodiola rosea'],
  'nmn': ['nicotinamide mononucleotide', 'nmn', 'beta-nmn'],
  'alpha-gpc': ['alpha-gpc', 'alpha gpc', 'choline alfoscerate'],
  'lions-mane': ["lion's mane", 'lions mane', 'hericium erinaceus'],
  'probiotics': ['lactobacillus', 'bifidobacterium', 'probiotic', 'acidophilus'],
  'zinc': ['zinc', 'zinc picolinate', 'zinc gluconate', 'zinc citrate'],
  'vitamin-b12': ['vitamin b12', 'b12', 'methylcobalamin', 'cyanocobalamin', 'cobalamin'],
  'iron': ['iron', 'ferrous', 'iron bisglycinate', 'ferritin'],
  'gaba': ['gaba', 'gamma-aminobutyric acid'],
  'glycine': ['glycine'],
};

class DSLDService {
  
  // Convert scanner barcode to DSLD spaced format
  // Scanner returns: "0753950000872" or "753950000872"
  // DSLD stores: "7 53950 00087 2" (groups of 1-5-5-1 digits)
  private formatBarcodeForDSLD(barcode: string): string {
    // Remove any existing spaces and leading zeros
    const cleanBarcode = barcode.replace(/\s/g, '').replace(/^0+/, '');
    
    // UPC-A is 12 digits, EAN-13 is 13 digits
    // DSLD format appears to be: X XXXXX XXXXX X (1-5-5-1 = 12 chars for UPC-A without check digit position variation)
    // Or for 12-digit: X XXXXX XXXXX X
    if (cleanBarcode.length === 12) {
      // Format as: X XXXXX XXXXX X
      return `${cleanBarcode[0]} ${cleanBarcode.slice(1, 6)} ${cleanBarcode.slice(6, 11)} ${cleanBarcode[11]}`;
    } else if (cleanBarcode.length === 11) {
      // Format as: X XXXXX XXXXX X (pad with trailing space group)
      return `${cleanBarcode[0]} ${cleanBarcode.slice(1, 6)} ${cleanBarcode.slice(6, 11)} ${cleanBarcode.slice(11)}`;
    }
    
    // For other lengths, try generic spacing
    return cleanBarcode;
  }

  // Search for products by name
  async searchProducts(query: string, limit: number = 20): Promise<DSLDSearchResult> {
    try {
      // Use search-filter endpoint (v9 API)
      const url = new URL(`${DSLD_API_BASE}/search-filter`);
      url.searchParams.set('q', query);
      url.searchParams.set('size', limit.toString());

      logger.info(`Searching DSLD for: ${query}`);

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        logger.warn(`DSLD API returned ${response.status}`);
        return { products: [], totalCount: 0 };
      }

      const data = await response.json();
      
      const products: DSLDProduct[] = (data.hits || []).map((hit: any) => this.mapToProduct(hit));
      
      return {
        products,
        totalCount: data.total?.value || data.total || products.length,
      };
    } catch (error) {
      logger.error('DSLD search failed', { error, query });
      return { products: [], totalCount: 0 };
    }
  }

  // Look up product by barcode (UPC)
  async lookupByBarcode(barcode: string): Promise<DSLDProduct | null> {
    try {
      logger.info(`Looking up DSLD product by barcode: ${barcode}`);
      
      // Try multiple barcode formats
      const formatsToTry = [
        barcode,  // Original
        this.formatBarcodeForDSLD(barcode),  // Spaced format
        barcode.replace(/^0+/, ''),  // Without leading zeros
      ];
      
      for (const format of formatsToTry) {
        if (!format) continue;
        
        // DSLD API requires barcode wrapped in quotes for exact match
        // URL encode: quotes = %22, spaces = %20
        const quotedBarcode = `"${format}"`;
        const url = new URL(`${DSLD_API_BASE}/search-filter`);
        url.searchParams.set('q', quotedBarcode);
        url.searchParams.set('size', '5');

        logger.info(`Trying DSLD barcode format: ${format}`);

        const response = await fetch(url.toString(), {
          headers: {
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          logger.warn(`DSLD API returned ${response.status} for barcode ${format}`);
          continue;
        }

        const data = await response.json();
        
        if (data.hits && data.hits.length > 0) {
          const product = this.mapToProduct(data.hits[0]);
          logger.info(`Found DSLD product: ${product.productName} by ${product.brandName}`);
          return product;
        }
      }

      logger.warn(`No DSLD product found for barcode: ${barcode}`);
      return null;
    } catch (error) {
      logger.error('DSLD barcode lookup failed', { error, barcode });
      return null;
    }
  }

  // Alternative barcode search - now just calls main search
  private async searchByUPC(barcode: string): Promise<DSLDProduct | null> {
    return this.lookupByBarcode(barcode);
  }

  // Get product details by DSLD ID
  async getProductById(dsldId: string): Promise<DSLDProduct | null> {
    try {
      const url = `${DSLD_API_BASE}/label/${dsldId}`;

      logger.info(`Fetching DSLD product: ${dsldId}`);

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        logger.warn(`DSLD API returned ${response.status} for product ${dsldId}`);
        return null;
      }

      const data = await response.json();
      return this.mapToProduct(data);
    } catch (error) {
      logger.error('DSLD product fetch failed', { error, dsldId });
      return null;
    }
  }

  // Map DSLD API response to our product interface
  private mapToProduct(data: any): DSLDProduct {
    // Handle different response structures (search hit vs direct product)
    const source = data._source || data;
    
    const ingredients: DSLDIngredient[] = [];
    
    // Parse ingredients from v9 API format (allIngredients array)
    if (source.allIngredients && Array.isArray(source.allIngredients)) {
      for (const ing of source.allIngredients) {
        // Skip non-active ingredients (category: 'other')
        if (ing.category === 'other') continue;
        
        ingredients.push({
          ingredientName: ing.name || '',
          amount: undefined, // v9 doesn't include amount in search results
          unit: undefined,
          dvPercent: undefined,
        });
      }
    }
    
    // Fallback: Parse legacy ingredient format
    if (ingredients.length === 0 && (source.IngredName || source.ingredName)) {
      const ingredientNames = source.IngredName || source.ingredName || [];
      const amounts = source.IngredAmount || source.ingredAmount || [];
      const units = source.IngredUnit || source.ingredUnit || [];
      const dvPercents = source.IngredDV || source.ingredDv || [];

      for (let i = 0; i < ingredientNames.length; i++) {
        ingredients.push({
          ingredientName: ingredientNames[i] || '',
          amount: amounts[i] ? parseFloat(amounts[i]) : undefined,
          unit: units[i] || undefined,
          dvPercent: dvPercents[i] ? parseFloat(dvPercents[i]) : undefined,
        });
      }
    }

    // Parse net contents from v9 format
    const netContents = source.netContents?.[0];
    
    // Parse target groups from v9 format
    const targetGroups = source.userGroups?.map((g: any) => 
      g.dailyValueTargetGroupName || g.langualCodeDescription
    ) || source.Target_Groups || source.targetGroups;

    return {
      id: data._id || source.DSLD_ID || source.dsldId || '',
      productName: source.fullName || source.Product_Name || source.productName || 'Unknown Product',
      brandName: source.brandName || source.Brand_Name || 'Unknown Brand',
      netContentsNumber: netContents?.quantity ?? (source.NetContents_Number ? parseFloat(source.NetContents_Number) : undefined),
      netContentsUnit: netContents?.unit || source.NetContents_Unit || source.netContentsUnit,
      servingSize: source.servingSize || source.Serving_Size,
      servingsPerContainer: source.servingsPerContainer || source.Servings_Per_Container,
      dosageForm: source.physicalState?.langualCodeDescription || source.Dosage_Form || source.dosageForm,
      upc: source.upcSku || source.UPC || source.upc,
      ingredients,
      targetGroups,
      statementOfIdentity: source.statementOfIdentity || source.Statement_Of_Identity,
    };
  }

  // Detect which supplement type matches the product
  detectSupplementType(product: DSLDProduct): string | null {
    const productText = [
      product.productName,
      product.statementOfIdentity,
      ...product.ingredients.map(i => i.ingredientName),
    ].join(' ').toLowerCase();

    for (const [supplementTypeId, keywords] of Object.entries(INGREDIENT_TO_SUPPLEMENT_TYPE)) {
      for (const keyword of keywords) {
        if (productText.includes(keyword.toLowerCase())) {
          return supplementTypeId;
        }
      }
    }

    return null;
  }

  // Get primary active ingredient amount
  getPrimaryIngredient(product: DSLDProduct, supplementType: string): DSLDIngredient | null {
    const keywords = INGREDIENT_TO_SUPPLEMENT_TYPE[supplementType] || [];
    
    for (const ingredient of product.ingredients) {
      const ingredientName = ingredient.ingredientName.toLowerCase();
      for (const keyword of keywords) {
        if (ingredientName.includes(keyword.toLowerCase())) {
          return ingredient;
        }
      }
    }

    // Return first ingredient with an amount as fallback
    return product.ingredients.find(i => i.amount !== undefined) || null;
  }
}

export const dsldService = new DSLDService();
