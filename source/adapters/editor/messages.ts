export const SKILL_MESSAGES = {
  startServer: 'start-skill-server',
  stopServer: 'stop-skill-server',
  getServerInfo: 'get-skill-server-info',
  updateServerConfig: 'update-skill-server-config'
} as const;

export type SkillMessageKey = typeof SKILL_MESSAGES[keyof typeof SKILL_MESSAGES];
