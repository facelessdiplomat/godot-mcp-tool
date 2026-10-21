const versionPattern =
  /^(?<major>\d+)\.(?<minor>\d+)(?:\.(?<patch>\d+))?\.(?<status>[a-z0-9_]+)(?:\.(?<moduleConfig>mono))?\.(?<build>[A-Za-z0-9_]+)(?:\.(?<hash>[0-9a-f]+))?$/;

export class GodotVersion {
  private constructor(
    readonly major: number,
    readonly minor: number,
    readonly patch: number,
    readonly status: string,
    readonly moduleConfig: string,
    readonly build: string,
    readonly hash: string,
  ) {}

  static parse(text: string): GodotVersion {
    const trimmedText = text.trim();
    const parts = versionPattern.exec(trimmedText)?.groups;
    if (parts?.['major'] === undefined || parts['minor'] === undefined) {
      throw new Error(`"${trimmedText}" is not a Godot version string`);
    }
    return new GodotVersion(
      Number(parts['major']),
      Number(parts['minor']),
      Number(parts['patch'] ?? '0'),
      parts['status'] ?? '',
      parts['moduleConfig'] ?? '',
      parts['build'] ?? '',
      parts['hash'] ?? '',
    );
  }

  isAtLeast(major: number, minor: number): boolean {
    return this.major > major || (this.major === major && this.minor >= minor);
  }

  toString(): string {
    const numbers = this.patch > 0 ? [this.major, this.minor, this.patch] : [this.major, this.minor];
    return [numbers.join('.'), this.status, this.moduleConfig, this.build, this.hash].filter((part) => part !== '').join('.');
  }
}
