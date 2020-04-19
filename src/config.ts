export class Config {
  static API_VERSION = '2006-03-01';
  static ENDPOINT = process.env.ENDPOINT || '';
  static BUCKET = process.env.BUCKET || '';
  static ACCESS_KEY = process.env.ACCESS_KEY || '';
  static SECRET_KEY = process.env.SECRET_KEY || '';
  static MAX_RETRIES = +(process.env.MAX_RETRIES || 3);
  static FORCE_PATH_STYLE = [true, 1, 'true'].includes(process.env.FORCE_PATH_STYLE || true);
  static SSL_ENABLED = [true, 1, 'true'].includes(process.env.SSL_ENABLED || false);
  static TAG = '[node-s3]';
  static MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
  static MYSQL_PORT = +(process.env.MYSQL_PORT || 3306);
  static MYSQL_USER = process.env.MYSQL_USER || '';
  static MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';
  static MYSQL_DATABASE = process.env.MYSQL_DATABASE || '';
}
