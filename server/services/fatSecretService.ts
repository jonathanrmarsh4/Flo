/**
 * FatSecret Platform API Service
 * 
 * OAuth2 client credentials flow for food search and barcode lookup.
 * Uses the FatSecret Platform API to search for foods and get nutrition data.
 */

import { logger } from '../utils/logger';

interface FatSecretToken {
  accessToken: string;
  expiresAt: number;
}

interface FoodItem {
  food_id: string;
  food_name: string;
  brand_name?: string;
  food_type: string;
  food_url: string;
  food_description: string;
}

interface FoodSearchResponse {
  foods?: {
    food?: FoodItem | FoodItem[];
    max_results: string;
    page_number: string;
    total_results: string;
  };
}

interface FoodServing {
  serving_id: string;
  serving_description: string;
  serving_url?: string;
  metric_serving_amount?: string;
  metric_serving_unit?: string;
  number_of_units?: string;
  measurement_description?: string;
  calories?: string;
  carbohydrate?: string;
  protein?: string;
  fat?: string;
  saturated_fat?: string;
  polyunsaturated_fat?: string;
  monounsaturated_fat?: string;
  cholesterol?: string;
  sodium?: string;
  potassium?: string;
  fiber?: string;
  sugar?: string;
}

interface FoodDetailResponse {
  food?: {
    food_id: string;
    food_name: string;
    brand_name?: string;
    food_type: string;
    food_url: string;
    servings?: {
      serving?: FoodServing | FoodServing[];
    };
  };
}

interface BarcodeResponse {
  food_id?: {
    value: string;
  };
}

interface ImageRecognitionFood {
  food_id: number;
  food_entry_name: string;
  eaten?: {
    food_name_singular: string;
    units: number;
    total_nutritional_content: {
      calories: string;
      carbohydrate: string;
      protein: string;
      fat: string;
      fiber?: string;
      sugar?: string;
    };
  };
  suggested_serving?: {
    serving_description: string;
    custom_serving_description?: string;
  };
}

interface ImageRecognitionResponse {
  food_response?: ImageRecognitionFood[];
  error?: {
    code: number;
    message: string;
  };
}

export interface ParsedFoodItem {
  id: string;
  name: string;
  brand?: string;
  type: string;
  description: string;
  url: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  sugar?: number;
  servingDescription?: string;
}

export interface FoodDetail {
  id: string;
  name: string;
  brand?: string;
  type: string;
  url: string;
  servings: Array<{
    id: string;
    description: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    metricAmount?: number;
    metricUnit?: string;
  }>;
}

class FatSecretService {
  private token: FatSecretToken | null = null;
  private readonly tokenUrl = 'https://oauth.fatsecret.com/connect/token';
  private readonly apiUrl = 'https://platform.fatsecret.com/rest/server.api';

  private getCredentials(): { clientId: string; clientSecret: string } {
    const clientId = process.env.FATSECRET_CLIENT_ID;
    const clientSecret = process.env.FATSECRET_API_KEY;

    if (!clientId || !clientSecret) {
      throw new Error('FatSecret credentials not configured');
    }

    return { clientId, clientSecret };
  }

  private async getAccessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt - 60000) {
      return this.token.accessToken;
    }

    const { clientId, clientSecret } = this.getCredentials();
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    try {
      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials&scope=basic',
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[FatSecret] Token request failed:', errorText);
        throw new Error(`Failed to get FatSecret access token: ${response.status}`);
      }

      const data = await response.json();
      this.token = {
        accessToken: data.access_token,
        expiresAt: Date.now() + (data.expires_in * 1000),
      };

      logger.info(`[FatSecret] Access token obtained, expires in ${data.expires_in} seconds`);
      return this.token.accessToken;
    } catch (error) {
      logger.error('[FatSecret] Failed to get access token:', error);
      throw error;
    }
  }

  private async apiRequest<T>(params: Record<string, string>): Promise<T> {
    const accessToken = await this.getAccessToken();

    const searchParams = new URLSearchParams({
      ...params,
      format: 'json',
    });

    const url = `${this.apiUrl}?${searchParams.toString()}`;
    logger.debug('[FatSecret] API request:', { method: params.method, url: url.substring(0, 150) });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('[FatSecret] API request failed:', { status: response.status, error: errorText });
      throw new Error(`FatSecret API error: ${response.status}`);
    }

    const data = await response.json();
    logger.debug('[FatSecret] API response received:', { keys: Object.keys(data || {}) });
    return data;
  }

  private parseDescription(description: string): { calories?: number; protein?: number; carbs?: number; fat?: number; serving?: string } {
    const result: { calories?: number; protein?: number; carbs?: number; fat?: number; serving?: string } = {};
    
    const caloriesMatch = description.match(/Calories:\s*([\d.]+)kcal/i);
    if (caloriesMatch) result.calories = parseFloat(caloriesMatch[1]);
    
    const proteinMatch = description.match(/Protein:\s*([\d.]+)g/i);
    if (proteinMatch) result.protein = parseFloat(proteinMatch[1]);
    
    const carbsMatch = description.match(/Carbs:\s*([\d.]+)g/i);
    if (carbsMatch) result.carbs = parseFloat(carbsMatch[1]);
    
    const fatMatch = description.match(/Fat:\s*([\d.]+)g/i);
    if (fatMatch) result.fat = parseFloat(fatMatch[1]);

    const servingMatch = description.match(/^Per\s+(.+?)\s+-/i);
    if (servingMatch) result.serving = servingMatch[1];

    return result;
  }

  async searchFoods(query: string, maxResults: number = 20): Promise<ParsedFoodItem[]> {
    if (!query || query.trim().length === 0) {
      logger.warn('[FatSecret] Empty query provided');
      return [];
    }

    try {
      logger.info('[FatSecret] Searching for:', { query, maxResults });
      const response = await this.apiRequest<FoodSearchResponse>({
        method: 'foods.search',
        search_expression: query,
        max_results: maxResults.toString(),
        page_number: '0',
      });

      logger.info('[FatSecret] Raw response:', { 
        hasFoods: !!response.foods, 
        totalResults: response.foods?.total_results,
        foodCount: response.foods?.food ? (Array.isArray(response.foods.food) ? response.foods.food.length : 1) : 0
      });

      if (!response.foods?.food) {
        logger.warn('[FatSecret] No foods in response');
        return [];
      }

      const foods = Array.isArray(response.foods.food) 
        ? response.foods.food 
        : [response.foods.food];

      return foods.map(food => {
        const parsed = this.parseDescription(food.food_description || '');
        return {
          id: food.food_id,
          name: food.food_name,
          brand: food.brand_name,
          type: food.food_type,
          description: food.food_description,
          url: food.food_url,
          calories: parsed.calories,
          protein: parsed.protein,
          carbs: parsed.carbs,
          fat: parsed.fat,
          servingDescription: parsed.serving,
        };
      });
    } catch (error) {
      logger.error('[FatSecret] Search failed:', error);
      throw error;
    }
  }

  async getFoodById(foodId: string): Promise<FoodDetail | null> {
    try {
      const response = await this.apiRequest<FoodDetailResponse>({
        method: 'food.get.v4',
        food_id: foodId,
      });

      if (!response.food) {
        return null;
      }

      const food = response.food;
      const servingsRaw = food.servings?.serving;
      const servings = servingsRaw 
        ? (Array.isArray(servingsRaw) ? servingsRaw : [servingsRaw])
        : [];

      return {
        id: food.food_id,
        name: food.food_name,
        brand: food.brand_name,
        type: food.food_type,
        url: food.food_url,
        servings: servings.map(s => ({
          id: s.serving_id,
          description: s.serving_description,
          calories: parseFloat(s.calories || '0'),
          protein: parseFloat(s.protein || '0'),
          carbs: parseFloat(s.carbohydrate || '0'),
          fat: parseFloat(s.fat || '0'),
          fiber: parseFloat(s.fiber || '0'),
          sugar: parseFloat(s.sugar || '0'),
          metricAmount: s.metric_serving_amount ? parseFloat(s.metric_serving_amount) : undefined,
          metricUnit: s.metric_serving_unit,
        })),
      };
    } catch (error) {
      logger.error('[FatSecret] Get food by ID failed:', error);
      return null;
    }
  }

  async findByBarcode(barcode: string): Promise<ParsedFoodItem | null> {
    try {
      // FatSecret API requires GTIN-13 format (13-digit zero-padded barcode)
      // UPC-A (12 digits) -> add leading zero
      // EAN-13 (13 digits) -> use as-is
      // EAN-8 (8 digits) -> zero-pad to 13 digits
      const normalizedBarcode = barcode.replace(/\D/g, '').padStart(13, '0');
      logger.info(`[FatSecret] Barcode lookup: original="${barcode}" normalized="${normalizedBarcode}"`);
      
      const response = await this.apiRequest<BarcodeResponse>({
        method: 'food.find_id_for_barcode',
        barcode: normalizedBarcode,
      });

      if (!response.food_id?.value) {
        logger.info(`[FatSecret] No food found for barcode: ${normalizedBarcode}`);
        return null;
      }

      const foodId = response.food_id.value;
      const foodDetail = await this.getFoodById(foodId);

      if (!foodDetail) {
        return null;
      }

      const defaultServing = foodDetail.servings[0];
      return {
        id: foodDetail.id,
        name: foodDetail.name,
        brand: foodDetail.brand,
        type: foodDetail.type,
        description: defaultServing 
          ? `Per ${defaultServing.description} - Calories: ${defaultServing.calories}kcal | Fat: ${defaultServing.fat}g | Carbs: ${defaultServing.carbs}g | Protein: ${defaultServing.protein}g`
          : '',
        url: foodDetail.url,
        calories: defaultServing?.calories,
        protein: defaultServing?.protein,
        carbs: defaultServing?.carbs,
        fat: defaultServing?.fat,
        fiber: defaultServing?.fiber,
        sugar: defaultServing?.sugar,
        servingDescription: defaultServing?.description,
      };
    } catch (error) {
      logger.error('[FatSecret] Barcode lookup failed:', error);
      return null;
    }
  }

  async autocomplete(query: string, maxResults: number = 10): Promise<string[]> {
    if (!query || query.trim().length < 2) {
      return [];
    }

    try {
      const response = await this.apiRequest<{ suggestions?: { suggestion?: string[] } }>({
        method: 'foods.autocomplete',
        expression: query,
        max_results: maxResults.toString(),
      });

      return response.suggestions?.suggestion || [];
    } catch (error) {
      logger.error('[FatSecret] Autocomplete failed:', error);
      return [];
    }
  }
}

export const fatSecretService = new FatSecretService();
