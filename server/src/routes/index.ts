// 路由统一出口
// 按领域拆分，各路由在独立文件中定义

export { default as chatRoutes } from './chat';
export { default as compareRoutes } from './compare';
export { default as documentRoutes } from './document';
export { default as sessionRoutes } from './session';
export { default as modelRoutes } from './model';
export { default as skillRoutes } from './skill';
export { default as usageRoutes } from './usage';
export { default as statsRoutes } from './stats';
export { default as memoryRoutes } from './memory';
export { default as promptRoutes } from './prompt';
export { default as codeRoutes } from './code';
export { default as agentsRoutes } from './agents';
export { default as customToolsRoutes } from './customTools';
export { default as workflowsRoutes } from './workflows';
export { default as dbConnectionsRoutes } from './dbConnections';
export { default as shareRoutes } from './share';
export { default as importRoutes } from './import';
export { default as apiKeysRoutes } from './apiKeys';
export { default as externalApiRoutes } from './externalApi';
export { default as userRoutes } from './user';
export { default as authRoutes } from './auth';
export { default as userApiKeysRoutes } from './userApiKeys';
export { default as agentMarketRoutes } from './agentMarket';
export { default as ratingRoutes } from './rating';
