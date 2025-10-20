const { Router } = require('express');
const { authenticateToken, requireTenantAccess } = require('../../core/middlewares/auth');
const recipeController = require('./recipe.controller');

const router = Router();

// Apply authentication and tenant access to all routes
router.use(authenticateToken);
router.use(requireTenantAccess);

// Recipe routes
router.post('/recipes', recipeController.createRecipe);
router.get('/recipes', recipeController.getRecipes);
router.get('/recipes/:id', recipeController.getRecipeById);
router.put('/recipes/:id', recipeController.updateRecipe);
router.delete('/recipes/:id', recipeController.deleteRecipe);
router.get('/recipes/:id/cost', recipeController.calculateRecipeCost);

// Production batch routes
router.post('/production-batches', recipeController.createProductionBatch);
router.get('/production-batches', recipeController.getProductionBatches);
router.get('/production-batches/:id', recipeController.getProductionBatchById);

// Advanced Recipe Analytics routes
router.get('/analytics/dashboard', recipeController.getRecipeAnalyticsDashboard);
router.get('/analytics/optimization-recommendations', recipeController.getRecipeOptimizationRecommendations);
router.get('/analytics/scaling/:id', recipeController.getRecipeScalingAnalysis);
router.get('/analytics/production-planning', recipeController.getProductionPlanningAnalysis);

// Advanced Recipe Analytics Service routes
router.get('/analytics/performance-analysis', recipeController.getRecipePerformanceAnalysis);
router.get('/analytics/ingredient-utilization', recipeController.getIngredientUtilizationAnalysis);
router.get('/analytics/cost-breakdown', recipeController.getRecipeCostBreakdownAnalysis);
router.get('/analytics/production-efficiency', recipeController.getProductionEfficiencyAnalysis);

module.exports = router;


