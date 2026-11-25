function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }
  return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
}

function parseNumberEnv(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

export class Config {
  static API_VERSION = '2006-03-01';
  static TAG = '[node-s3]';

  private static overrides: Record<string, unknown> = {};

  static resetOverrides(): void {
    this.overrides = {};
  }

  static get ENDPOINT(): string {
    if ('ENDPOINT' in this.overrides) {
      return this.overrides.ENDPOINT as string;
    }
    return process.env.AWS_ENDPOINT_URL || process.env.ENDPOINT || '';
  }

  static set ENDPOINT(value: string) {
    this.overrides.ENDPOINT = value;
  }

  static get BUCKET(): string {
    if ('BUCKET' in this.overrides) {
      return this.overrides.BUCKET as string;
    }
    return process.env.BUCKET || '';
  }

  static set BUCKET(value: string) {
    this.overrides.BUCKET = value;
  }

  static get REGION(): string {
    if ('REGION' in this.overrides) {
      return this.overrides.REGION as string;
    }
    return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  }

  static set REGION(value: string) {
    this.overrides.REGION = value;
  }

  static get ACCESS_KEY(): string {
    if ('ACCESS_KEY' in this.overrides) {
      return this.overrides.ACCESS_KEY as string;
    }
    return process.env.AWS_ACCESS_KEY_ID || process.env.ACCESS_KEY || '';
  }

  static set ACCESS_KEY(value: string) {
    this.overrides.ACCESS_KEY = value;
  }

  static get SECRET_KEY(): string {
    if ('SECRET_KEY' in this.overrides) {
      return this.overrides.SECRET_KEY as string;
    }
    return process.env.AWS_SECRET_ACCESS_KEY || process.env.SECRET_KEY || '';
  }

  static set SECRET_KEY(value: string) {
    this.overrides.SECRET_KEY = value;
  }

  static get SESSION_TOKEN(): string {
    if ('SESSION_TOKEN' in this.overrides) {
      return this.overrides.SESSION_TOKEN as string;
    }
    return process.env.AWS_SESSION_TOKEN || '';
  }

  static set SESSION_TOKEN(value: string) {
    this.overrides.SESSION_TOKEN = value;
  }

  static get MAX_RETRIES(): number {
    if ('MAX_RETRIES' in this.overrides) {
      return this.overrides.MAX_RETRIES as number;
    }
    return parseNumberEnv(process.env.MAX_RETRIES, 3);
  }

  static set MAX_RETRIES(value: number) {
    this.overrides.MAX_RETRIES = value;
  }

  static get FORCE_PATH_STYLE(): boolean {
    if ('FORCE_PATH_STYLE' in this.overrides) {
      return this.overrides.FORCE_PATH_STYLE as boolean;
    }
    return parseBooleanEnv(process.env.FORCE_PATH_STYLE, true);
  }

  static set FORCE_PATH_STYLE(value: boolean) {
    this.overrides.FORCE_PATH_STYLE = value;
  }

  static get SSL_ENABLED(): boolean {
    if ('SSL_ENABLED' in this.overrides) {
      return this.overrides.SSL_ENABLED as boolean;
    }
    return parseBooleanEnv(process.env.SSL_ENABLED, true);
  }

  static set SSL_ENABLED(value: boolean) {
    this.overrides.SSL_ENABLED = value;
  }

  static get BACKUP_ENCRYPTION_KEY(): string {
    if ('BACKUP_ENCRYPTION_KEY' in this.overrides) {
      return this.overrides.BACKUP_ENCRYPTION_KEY as string;
    }
    return process.env.BACKUP_ENCRYPTION_KEY || '';
  }

  static set BACKUP_ENCRYPTION_KEY(value: string) {
    this.overrides.BACKUP_ENCRYPTION_KEY = value;
  }

  static get MYSQL_HOST(): string {
    if ('MYSQL_HOST' in this.overrides) {
      return this.overrides.MYSQL_HOST as string;
    }
    return process.env.MYSQL_HOST || 'localhost';
  }

  static set MYSQL_HOST(value: string) {
    this.overrides.MYSQL_HOST = value;
  }

  static get MYSQL_PORT(): number {
    if ('MYSQL_PORT' in this.overrides) {
      return this.overrides.MYSQL_PORT as number;
    }
    return parseNumberEnv(process.env.MYSQL_PORT, 3306);
  }

  static set MYSQL_PORT(value: number) {
    this.overrides.MYSQL_PORT = value;
  }

  static get MYSQL_USER(): string {
    if ('MYSQL_USER' in this.overrides) {
      return this.overrides.MYSQL_USER as string;
    }
    return process.env.MYSQL_USER || '';
  }

  static set MYSQL_USER(value: string) {
    this.overrides.MYSQL_USER = value;
  }

  static get MYSQL_PASSWORD(): string {
    if ('MYSQL_PASSWORD' in this.overrides) {
      return this.overrides.MYSQL_PASSWORD as string;
    }
    return process.env.MYSQL_PASSWORD || '';
  }

  static set MYSQL_PASSWORD(value: string) {
    this.overrides.MYSQL_PASSWORD = value;
  }

  static get MYSQL_DATABASE(): string {
    if ('MYSQL_DATABASE' in this.overrides) {
      return this.overrides.MYSQL_DATABASE as string;
    }
    return process.env.MYSQL_DATABASE || '';
  }

  static set MYSQL_DATABASE(value: string) {
    this.overrides.MYSQL_DATABASE = value;
  }
}
