// Full search, command search and reader tools use one matching policy.
// The SDK bounds prefix expansion; presentations choose their own result limits.
export const SEARCH_MATCHING = Object.freeze({ bool: 'AND', expand: true });
