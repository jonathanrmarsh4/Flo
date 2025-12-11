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
  
  // Search for products by name
  async searchProducts(query: string, limit: number = 20): Promise<DSLDSearchResult> {
    try {
      const url = new URL(`${DSLD_API_BASE}/label/fullSearch`);
      url.searchParams.set('q', query);
      url.searchParams.set('offset', '0');
      url.searchParams.set('limit', limit.toString());

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
        totalCount: data.total || products.length,
      };
    } catch (error) {
      logger.error('DSLD search failed', { error, query });
      return { products: [], totalCount: 0 };
    }
  }

  // Look up product by barcode (UPC)
  async lookupByBarcode(barcode: string): Promise<DSLDProduct | null> {
    try {
      // The DSLD API supports UPC search
      const url = new URL(`${DSLD_API_BASE}/label/fullSearch`);
      url.searchParams.set('q', `upc:${barcode}`);
      url.searchParams.set('limit', '1');

      logger.info(`Looking up DSLD product by barcode: ${barcode}`);

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        // Try alternative search by UPC field
        return await this.searchByUPC(barcode);
      }

      const data = await response.json();
      
      if (data.hits && data.hits.length > 0) {
        return this.mapToProduct(data.hits[0]);
      }

      // Fallback to alternative search
      return await this.searchByUPC(barcode);
    } catch (error) {
      logger.error('DSLD barcode lookup failed', { error, barcode });
      return null;
    }
  }

  // Alternative barcode search
  private async searchByUPC(barcode: string): Promise<DSLDProduct | null> {
    try {
      // Try searching by the barcode directly
      const searchResult = await this.searchProducts(barcode, 5);
      
      // Find exact UPC match
      const exactMatch = searchResult.products.find(p => p.upc === barcode);
      if (exactMatch) {
        return exactMatch;
      }

      // Return first result if any
      return searchResult.products[0] || null;
    } catch (error) {
      logger.error('DSLD UPC search failed', { error, barcode });
      return null;
    }
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
    
    // Parse ingredients from the product data
    if (source.IngredName || source.ingredName) {
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

    return {
      id: source.DSLD_ID || source.dsldId || data._id || '',
      productName: source.Product_Name || source.productName || 'Unknown Product',
      brandName: source.Brand_Name || source.brandName || 'Unknown Brand',
      netContentsNumber: source.NetContents_Number ? parseFloat(source.NetContents_Number) : undefined,
      netContentsUnit: source.NetContents_Unit || source.netContentsUnit,
      servingSize: source.Serving_Size || source.servingSize,
      servingsPerContainer: source.Servings_Per_Container || source.servingsPerContainer,
      dosageForm: source.Dosage_Form || source.dosageForm,
      upc: source.UPC || source.upc,
      ingredients,
      targetGroups: source.Target_Groups || source.targetGroups,
      statementOfIdentity: source.Statement_Of_Identity || source.statementOfIdentity,
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
