const recipeService = require('./recipe.service');
const { ValidationError, NotFoundError } = require('../../core/exceptions');
const { PAGINATION } = require('../../core/constants');

async function createRecipe(req, res, next) {
  try {
    const { name, description, productId, items } = req.body;
    const tenantId = req.tenantId;

    if (!name || !items || !Array.isArray(items) || items.length === 0) {
      throw new ValidationError('Name and items are required');
    }

    const recipe = await recipeService.createRecipe({
      name,
      description,
      productId,
      items,
      tenantId
    });

    res.status(201).json({ success: true, data: recipe });
  } catch (err) {
    next(err);
  }
}

async function getRecipes(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const search = req.query.search;
    const productId = req.query.productId;

    const result = await recipeService.getRecipes({
      tenantId,
      page,
      limit,
      search,
      productId
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getRecipeById(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const recipe = await recipeService.getRecipeById(id, tenantId);
    if (!recipe) {
      throw new NotFoundError('Recipe not found');
    }

    res.json({ success: true, data: recipe });
  } catch (err) {
    next(err);
  }
}

async function updateRecipe(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const updateData = req.body;

    const recipe = await recipeService.updateRecipe(id, tenantId, updateData);
    if (!recipe) {
      throw new NotFoundError('Recipe not found');
    }

    res.json({ success: true, data: recipe });
  } catch (err) {
    next(err);
  }
}

async function deleteRecipe(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const deleted = await recipeService.deleteRecipe(id, tenantId);
    if (!deleted) {
      throw new NotFoundError('Recipe not found');
    }

    res.json({ success: true, message: 'Recipe deleted successfully' });
  } catch (err) {
    next(err);
  }
}

async function calculateRecipeCost(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const costAnalysis = await recipeService.calculateRecipeCost(id, tenantId);
    res.json({ success: true, data: costAnalysis });
  } catch (err) {
    next(err);
  }
}

async function createProductionBatch(req, res, next) {
  try {
    const { recipeId, quantity, warehouseId, note } = req.body;
    const createdById = req.user.id;

    if (!recipeId || !quantity || !warehouseId) {
      throw new ValidationError('recipeId, quantity, and warehouseId are required');
    }

    const result = await recipeService.createProductionBatch({
      recipeId,
      quantity: parseFloat(quantity),
      warehouseId,
      note,
      createdById
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getProductionBatches(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const recipeId = req.query.recipeId;

    const result = await recipeService.getProductionBatches({
      tenantId,
      page,
      limit,
      recipeId
    });

    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function getProductionBatchById(req, res, next) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const batch = await recipeService.getProductionBatchById(id, tenantId);
    if (!batch) {
      throw new NotFoundError('Production batch not found');
    }

    res.json({ success: true, data: batch });
  } catch (err) {
    next(err);
  }
}

// Advanced Recipe Analytics Controllers
async function getRecipeAnalyticsDashboard(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate, 
      groupBy = 'month' 
    } = req.query;

    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    if (groupBy) options.groupBy = groupBy;

    const dashboard = await recipeService.getRecipeAnalyticsDashboard(tenantId, options);
    res.json({ success: true, data: dashboard });
  } catch (err) {
    next(err);
  }
}

async function getRecipeOptimizationRecommendations(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate, 
      focus = 'all' 
    } = req.query;

    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    if (focus) options.focus = focus;

    const recommendations = await recipeService.getRecipeOptimizationRecommendations(tenantId, options);
    res.json({ success: true, data: recommendations });
  } catch (err) {
    next(err);
  }
}

async function getRecipeScalingAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { targetQuantity } = req.query;

    if (!targetQuantity) {
      throw new ValidationError('targetQuantity is required');
    }

    const analysis = await recipeService.getRecipeScalingAnalysis(tenantId, id, parseFloat(targetQuantity));
    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
}

async function getProductionPlanningAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate, 
      recipeId,
      priority = 'cost' 
    } = req.query;

    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    if (recipeId) options.recipeId = recipeId;
    if (priority) options.priority = priority;

    const analysis = await recipeService.getProductionPlanningAnalysis(tenantId, options);
    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
}

// Advanced Recipe Analytics Service Controllers
async function getRecipePerformanceAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate, 
      recipeId,
      groupBy = 'recipe' 
    } = req.query;

    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    if (recipeId) options.recipeId = recipeId;
    if (groupBy) options.groupBy = groupBy;

    const recipeAnalyticsService = require('./recipe-analytics.service');
    const analysis = await recipeAnalyticsService.getRecipePerformanceAnalysis(tenantId, options);
    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
}

async function getIngredientUtilizationAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate, 
      recipeId 
    } = req.query;

    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    if (recipeId) options.recipeId = recipeId;

    const recipeAnalyticsService = require('./recipe-analytics.service');
    const analysis = await recipeAnalyticsService.getIngredientUtilizationAnalysis(tenantId, options);
    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
}

async function getRecipeCostBreakdownAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate, 
      recipeId 
    } = req.query;

    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    if (recipeId) options.recipeId = recipeId;

    const recipeAnalyticsService = require('./recipe-analytics.service');
    const analysis = await recipeAnalyticsService.getRecipeCostBreakdownAnalysis(tenantId, options);
    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
}

async function getProductionEfficiencyAnalysis(req, res, next) {
  try {
    const tenantId = req.tenantId;
    const { 
      startDate, 
      endDate, 
      recipeId 
    } = req.query;

    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    if (recipeId) options.recipeId = recipeId;

    const recipeAnalyticsService = require('./recipe-analytics.service');
    const analysis = await recipeAnalyticsService.getProductionEfficiencyAnalysis(tenantId, options);
    res.json({ success: true, data: analysis });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createRecipe,
  getRecipes,
  getRecipeById,
  updateRecipe,
  deleteRecipe,
  calculateRecipeCost,
  createProductionBatch,
  getProductionBatches,
  getProductionBatchById,
  // Advanced Analytics Controllers
  getRecipeAnalyticsDashboard,
  getRecipeOptimizationRecommendations,
  getRecipeScalingAnalysis,
  getProductionPlanningAnalysis,
  // Advanced Analytics Service Controllers
  getRecipePerformanceAnalysis,
  getIngredientUtilizationAnalysis,
  getRecipeCostBreakdownAnalysis,
  getProductionEfficiencyAnalysis
};
