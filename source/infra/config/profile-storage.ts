export class ProfileStorage {
  private readonly namespace: string;

  constructor(namespace: string = 'cocos-skill') {
    this.namespace = namespace;
  }

  load<T>(key: string, fallback: T): T {
    try {
      const profileApi = Editor.Profile as any;
      if (typeof profileApi?.getProject !== 'function') {
        return fallback;
      }

      const value = profileApi.getProject(this.namespace, key);
      if (value && typeof value.then === 'function') {
        return fallback;
      }

      if (value && typeof value.get === 'function') {
        return (value.get(key) as T | undefined) ?? fallback;
      }

      return (value as T | undefined) ?? fallback;
    } catch {
      return fallback;
    }
  }

  save<T>(key: string, value: T): void {
    try {
      const profileApi = Editor.Profile as any;
      if (typeof profileApi?.setProject === 'function') {
        const result = profileApi.setProject(this.namespace, key, value);
        if (result && typeof result.catch === 'function') {
          result.catch(() => undefined);
        }
        return;
      }

      if (typeof profileApi?.getProject === 'function') {
        const profile = profileApi.getProject(this.namespace, key);
        if (profile && typeof profile.set === 'function') {
          profile.set(key, value);
          if (typeof profile.save === 'function') {
            profile.save();
          }
        }
      }
    } catch {
      // noop
    }
  }
}
