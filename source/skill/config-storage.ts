import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { SkillServerConfig, DEFAULT_SERVER_CONFIG } from './config.js';
import { syncSkillTemplateFile } from './skill-template-sync.js';

/**
 * Configuration storage manager for persisting skill server settings.
 */
export class ConfigStorage {
    private readonly projectPath: string;
    private readonly profileNamespace: string;
    private readonly profileKey: string;
    private readonly skillTemplateName: string;
    private readonly projectConfigFileName: string;
    private cachedConfig: SkillServerConfig | null = null;

    constructor() {
        this.projectPath = Editor.Project.path;
        this.profileNamespace = 'cocos-skill';
        this.profileKey = 'cocos-skill.server-config';
        this.skillTemplateName = 'cocos-skill';
        this.projectConfigFileName = '.cocos-skill-config.json';
    }

    private getProjectConfigPath(): string {
        return path.join(this.projectPath, this.projectConfigFileName);
    }

    private getBundledSkillTemplateDir(): string | null {
        const rootCandidates = [
            path.resolve(__dirname),
            path.resolve(__dirname, '..'),
            path.resolve(__dirname, '../..'),
            path.resolve(__dirname, '../../..'),
            process.cwd()
        ];

        const templateCandidates = [
            path.join('static', 'skill-template', this.skillTemplateName),
            path.join('.claude', 'skills', this.skillTemplateName)
        ];

        for (const root of rootCandidates) {
            for (const relativeTemplateDir of templateCandidates) {
                const templateDir = path.join(root, relativeTemplateDir);
                const skillFile = path.join(templateDir, 'SKILL.md');
                if (fs.existsSync(skillFile)) {
                    return templateDir;
                }
            }
        }

        return null;
    }

    private syncTemplateDirectory(sourceDir: string, targetDir: string): void {
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
            console.log(`Created skill template directory: ${targetDir}`);
        }

        const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
        for (const entry of entries) {
            const sourcePath = path.join(sourceDir, entry.name);
            const targetPath = path.join(targetDir, entry.name);

            if (entry.isDirectory()) {
                this.syncTemplateDirectory(sourcePath, targetPath);
                continue;
            }

            if (!entry.isFile()) {
                continue;
            }

            if (entry.name === 'SKILL.md') {
                const result = syncSkillTemplateFile(sourcePath, targetPath);
                if (result === 'copied') {
                    console.log(`Copied skill template file: ${targetPath}`);
                }
                if (result === 'updated') {
                    console.log(`Updated managed skill section: ${targetPath}`);
                }
                continue;
            }

            if (!fs.existsSync(targetPath)) {
                fs.mkdirSync(path.dirname(targetPath), { recursive: true });
                fs.copyFileSync(sourcePath, targetPath);
                console.log(`Copied skill template file: ${targetPath}`);
            }
        }
    }

    private mergeConfig(savedConfig: Partial<SkillServerConfig>): SkillServerConfig {
        return {
            ...DEFAULT_SERVER_CONFIG,
            ...savedConfig,
            tools: {
                ...DEFAULT_SERVER_CONFIG.tools,
                ...savedConfig.tools
            }
        };
    }

    private readProfileConfig(): Partial<SkillServerConfig> | null {
        try {
            const profileApi = (Editor.Profile as any);
            if (!profileApi || typeof profileApi.getProject !== 'function') {
                return null;
            }

            const projectProfile = profileApi.getProject(this.profileNamespace, this.profileKey);

            if (projectProfile && typeof projectProfile.then === 'function') {
                projectProfile
                    .then((value: Partial<SkillServerConfig>) => {
                        if (value) {
                            this.cachedConfig = this.mergeConfig(value);
                        }
                    })
                    .catch((error: unknown) => {
                        console.warn('Failed to read skill profile config asynchronously:', error);
                    });
                return null;
            }

            if (projectProfile && typeof projectProfile.get === 'function') {
                const value = projectProfile.get(this.profileKey) ?? projectProfile.get();
                return (value as Partial<SkillServerConfig> | undefined) ?? null;
            }

            return (projectProfile as Partial<SkillServerConfig> | undefined) ?? null;
        } catch (error) {
            console.warn('Failed to read skill profile config:', error);
            return null;
        }
    }

    private readProjectConfig(): Partial<SkillServerConfig> | null {
        const projectConfigPath = this.getProjectConfigPath();
        if (!fs.existsSync(projectConfigPath)) {
            return null;
        }

        try {
            const text = fs.readFileSync(projectConfigPath, 'utf8');
            const raw = JSON.parse(text) as Record<string, unknown>;
            if (!raw || typeof raw !== 'object') {
                return null;
            }

            const config: Partial<SkillServerConfig> = {};

            if (typeof raw.port === 'number' && Number.isInteger(raw.port) && raw.port > 0) {
                config.port = raw.port;
            }
            if (typeof raw.name === 'string' && raw.name.length > 0) {
                config.name = raw.name;
            }
            if (typeof raw.version === 'string' && raw.version.length > 0) {
                config.version = raw.version;
            }
            if (typeof raw.autoStart === 'boolean') {
                config.autoStart = raw.autoStart;
            }
            if (raw.tools && typeof raw.tools === 'object') {
                config.tools = raw.tools as SkillServerConfig['tools'];
            }

            return Object.keys(config).length > 0 ? config : null;
        } catch (error) {
            console.warn('Failed to read skill project config file:', error);
            return null;
        }
    }

    private saveProjectConfig(config: SkillServerConfig): boolean {
        const projectConfigPath = this.getProjectConfigPath();

        try {
            const payload = {
                port: config.port,
                baseUrl: `http://127.0.0.1:${config.port}/skill`,
                name: config.name,
                version: config.version,
                autoStart: config.autoStart,
                tools: config.tools,
                profileKey: this.profileKey,
                updatedAt: new Date().toISOString()
            };
            fs.writeFileSync(projectConfigPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
            return true;
        } catch (error) {
            console.warn('Failed to write skill project config file:', error);
            return false;
        }
    }

    private deleteProjectConfig(): boolean {
        const projectConfigPath = this.getProjectConfigPath();
        if (!fs.existsSync(projectConfigPath)) {
            return true;
        }

        try {
            fs.unlinkSync(projectConfigPath);
            return true;
        } catch (error) {
            console.warn('Failed to delete skill project config file:', error);
            return false;
        }
    }

    /**
     * Generate a deterministic port based on project path
     * Uses hash of project path to ensure same project always gets same port
     * Port range: 3000-3999 (1000 ports available)
     */
    generateSmartPort(): number {
        const hash = crypto.createHash('md5').update(this.projectPath).digest('hex');
        // Take first 8 characters of hash and convert to number
        const hashNum = parseInt(hash.substring(0, 8), 16);
        // Map to port range 3000-3999
        const port = 3000 + (hashNum % 1000);
        return port;
    }

    /**
     * Load configuration from disk
     * For new projects, generates a smart port based on project path
     */
    loadConfig(): SkillServerConfig {
        if (this.cachedConfig) {
            this.saveProjectConfig(this.cachedConfig);
            return this.cachedConfig;
        }

        const savedConfig = this.readProfileConfig();
        if (savedConfig) {
            this.cachedConfig = this.mergeConfig(savedConfig);
            this.saveProjectConfig(this.cachedConfig);
            return this.cachedConfig;
        }

        const projectConfig = this.readProjectConfig();
        if (projectConfig) {
            this.cachedConfig = this.mergeConfig(projectConfig);
            // Backfill Editor.Profile when only project config file exists.
            this.saveConfig(this.cachedConfig);
            return this.cachedConfig;
        }

        // First time setup: use smart port for new projects
        const smartPort = this.generateSmartPort();
        const newConfig: SkillServerConfig = {
            ...DEFAULT_SERVER_CONFIG,
            port: smartPort
        };

        // Save the new config immediately so the smart port is persisted
        this.saveConfig(newConfig);

        return newConfig;
    }

    /**
     * Save configuration to editor profile
     */
    saveConfig(config: SkillServerConfig): boolean {
        this.cachedConfig = this.mergeConfig(config);
        const projectSaved = this.saveProjectConfig(this.cachedConfig);

        try {
            const profileApi = (Editor.Profile as any);
            if (!profileApi) {
                return projectSaved;
            }

            let profileSaved = false;

            if (typeof profileApi.setProject === 'function') {
                const maybePromise = profileApi.setProject(
                    this.profileNamespace,
                    this.profileKey,
                    this.cachedConfig
                );
                if (maybePromise && typeof maybePromise.catch === 'function') {
                    maybePromise.catch((error: unknown) => {
                        console.error('Failed to save skill profile config asynchronously:', error);
                    });
                }
                profileSaved = true;
                return profileSaved || projectSaved;
            }

            if (typeof profileApi.getProject === 'function') {
                const profile = profileApi.getProject(this.profileNamespace, this.profileKey);
                if (profile && typeof profile.set === 'function') {
                    profile.set(this.profileKey, this.cachedConfig);
                    if (typeof profile.save === 'function') {
                        profile.save();
                    }
                    profileSaved = true;
                    return profileSaved || projectSaved;
                }
            }

            return profileSaved || projectSaved;
        } catch (error) {
            console.error('Failed to save skill profile config:', error);
            return projectSaved;
        }
    }

    /**
     * Ensure runtime setup exists for AI workflows:
     * - skill directories
     * - persisted server config
     */
    ensureProjectSetup(): boolean {
        try {
            this.ensureAiDirectories();
            this.loadConfig();
            return true;
        } catch (error) {
            console.error('Failed to ensure project setup:', error);
            return false;
        }
    }

    /**
     * Ensure AI client directories (.claude/skills, .codex/skills, .agent/skills) exist
     */
    ensureAiDirectories(): void {
        const skillRootDirs = [
            path.join(this.projectPath, '.claude', 'skills'),
            path.join(this.projectPath, '.codex', 'skills'),
            path.join(this.projectPath, '.agent', 'skills')
        ];

        const bundledTemplateDir = this.getBundledSkillTemplateDir();
        if (!bundledTemplateDir) {
            console.warn(`Bundled skill template is missing: ${this.skillTemplateName}`);
            return;
        }

        for (const dir of skillRootDirs) {
            try {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                    console.log(`Created AI directory: ${dir}`);
                }

                const skillDir = path.join(dir, this.skillTemplateName);
                this.syncTemplateDirectory(bundledTemplateDir, skillDir);
            } catch (error) {
                console.warn(`Failed to create AI directory ${dir}:`, error);
            }
        }
    }

    /**
     * Check if profile config exists
     */
    configExists(): boolean {
        if (this.cachedConfig) {
            return true;
        }
        return this.readProfileConfig() !== null || this.readProjectConfig() !== null;
    }

    /**
     * Delete profile configuration
     */
    deleteConfig(): boolean {
        this.cachedConfig = null;
        const projectDeleted = this.deleteProjectConfig();
        try {
            const profileApi = (Editor.Profile as any);
            if (!profileApi) {
                return projectDeleted;
            }

            let profileDeleted = false;

            if (typeof profileApi.removeProject === 'function') {
                const maybePromise = profileApi.removeProject(this.profileNamespace, this.profileKey);
                if (maybePromise && typeof maybePromise.catch === 'function') {
                    maybePromise.catch((error: unknown) => {
                        console.error('Failed to delete skill profile config asynchronously:', error);
                    });
                }
                profileDeleted = true;
                return profileDeleted || projectDeleted;
            }

            if (typeof profileApi.getProject === 'function') {
                const profile = profileApi.getProject(this.profileNamespace, this.profileKey);
                if (profile && typeof profile.remove === 'function') {
                    profile.remove(this.profileKey);
                    if (typeof profile.save === 'function') {
                        profile.save();
                    }
                    profileDeleted = true;
                    return profileDeleted || projectDeleted;
                }
            }

            return profileDeleted || projectDeleted;
        } catch (error) {
            console.error('Failed to delete skill profile config:', error);
            return projectDeleted;
        }
    }
}
