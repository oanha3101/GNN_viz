-- GNN-Insight MySQL schema sync
-- Purpose:
--   - create missing tables for the current relational metadata schema
--   - add missing columns, indexes, and foreign keys to older tables
-- Notes:
--   - run this against the target MySQL database selected by `USE gnn_db;`
--   - this script does not drop columns or destroy data
--   - if foreign-key creation fails, inspect old orphan rows before retrying

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT,
  email VARCHAR(100) NOT NULL,
  username VARCHAR(50) NOT NULL,
  hashed_password VARCHAR(200) NOT NULL,
  full_name VARCHAR(100) NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'researcher',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_superuser TINYINT(1) NOT NULL DEFAULT 0,
  profile_image VARCHAR(255) NULL,
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS projects (
  id INT NOT NULL AUTO_INCREMENT,
  title VARCHAR(100) NOT NULL,
  description TEXT NULL,
  task_type INT NULL,
  model_type VARCHAR(20) NULL,
  is_public TINYINT(1) NOT NULL DEFAULT 0,
  owner_id INT NULL,
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_projects_owner_id (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS datasets (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  description TEXT NULL,
  owner_id INT NULL,
  is_public TINYINT(1) NOT NULL DEFAULT 0,
  current_version_id INT NULL,
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_datasets_slug (slug),
  KEY idx_datasets_name (name),
  KEY idx_datasets_owner_id (owner_id),
  KEY idx_datasets_current_version_id (current_version_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dataset_versions (
  id INT NOT NULL AUTO_INCREMENT,
  dataset_id INT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  lifecycle VARCHAR(20) NOT NULL DEFAULT 'draft',
  schema_version VARCHAR(20) NULL DEFAULT '2.0',
  summary_json JSON NULL,
  validation_json JSON NULL,
  source_files_json JSON NULL,
  raw_blob_key VARCHAR(500) NULL,
  processed_blob_key VARCHAR(500) NULL,
  created_by INT NULL,
  published_by INT NULL,
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  published_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dataset_version (dataset_id, version),
  KEY idx_dataset_versions_dataset_id (dataset_id),
  KEY idx_dataset_versions_lifecycle (lifecycle),
  KEY idx_dataset_versions_created_by (created_by),
  KEY idx_dataset_versions_published_by (published_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS experiments (
  id INT NOT NULL AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL DEFAULT 'Untitled Run',
  project_id INT NULL,
  owner_id INT NULL,
  dataset_id INT NULL,
  dataset_version_id INT NULL,
  task_type INT NULL DEFAULT 1,
  model_type VARCHAR(20) NULL DEFAULT 'GCN',
  dataset_name VARCHAR(100) NULL DEFAULT 'cora',
  epoch_count INT NULL DEFAULT 0,
  learning_rate FLOAT NULL,
  hidden_dim INT NULL,
  dropout FLOAT NULL,
  accuracy FLOAT NULL,
  loss FLOAT NULL,
  best_epoch INT NULL DEFAULT 0,
  status VARCHAR(20) NULL DEFAULT 'completed',
  mongo_run_id VARCHAR(100) NULL,
  mongo_graph_payload_id VARCHAR(100) NULL,
  mongo_metrics_id VARCHAR(100) NULL,
  config_json JSON NULL,
  retention_state VARCHAR(20) NULL DEFAULT 'full',
  notes TEXT NULL,
  is_best TINYINT(1) NOT NULL DEFAULT 0,
  is_mock TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_experiments_project_id (project_id),
  KEY idx_experiments_owner_id (owner_id),
  KEY idx_experiments_dataset_id (dataset_id),
  KEY idx_experiments_dataset_version_id (dataset_version_id),
  KEY idx_experiments_task_type (task_type),
  KEY idx_experiments_model_type (model_type),
  KEY idx_experiments_status (status),
  KEY idx_experiments_mongo_run_id (mongo_run_id),
  KEY idx_experiments_mongo_graph_payload_id (mongo_graph_payload_id),
  KEY idx_experiments_mongo_metrics_id (mongo_metrics_id),
  KEY idx_experiments_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS training_sessions (
  id VARCHAR(36) NOT NULL,
  user_id INT NULL,
  project_id INT NULL,
  experiment_id INT NULL,
  dataset_version_id INT NULL,
  task_type INT NOT NULL,
  model_type VARCHAR(20) NULL DEFAULT 'GCN',
  dataset_name VARCHAR(100) NULL DEFAULT 'cora',
  config_json JSON NULL,
  status VARCHAR(20) NULL DEFAULT 'pending',
  last_epoch INT NULL DEFAULT -1,
  total_epochs INT NULL DEFAULT 100,
  last_seq INT NULL DEFAULT 0,
  started_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME NULL,
  error_message TEXT NULL,
  mongo_run_id VARCHAR(100) NULL,
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_training_sessions_user_id (user_id),
  KEY idx_training_sessions_project_id (project_id),
  KEY idx_training_sessions_experiment_id (experiment_id),
  KEY idx_training_sessions_dataset_version_id (dataset_version_id),
  KEY idx_training_sessions_status (status),
  KEY idx_training_sessions_mongo_run_id (mongo_run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS session_snapshots (
  id INT NOT NULL AUTO_INCREMENT,
  session_id VARCHAR(36) NOT NULL,
  experiment_id INT NULL,
  epoch INT NOT NULL,
  mongo_doc_id VARCHAR(100) NULL,
  blob_ref VARCHAR(500) NULL,
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_session_epoch (session_id, epoch),
  KEY idx_session_snapshots_experiment_id (experiment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT NOT NULL AUTO_INCREMENT,
  actor_user_id INT NULL,
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id VARCHAR(100) NULL,
  details_json JSON NULL,
  created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_logs_actor_user_id (actor_user_id),
  KEY idx_audit_logs_action (action),
  KEY idx_audit_logs_target_type (target_type),
  KEY idx_audit_logs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS sp_add_column_if_missing;
DROP PROCEDURE IF EXISTS sp_add_index_if_missing;
DROP PROCEDURE IF EXISTS sp_add_fk_if_missing;

DELIMITER $$

CREATE PROCEDURE sp_add_column_if_missing(
  IN p_table_name VARCHAR(128),
  IN p_column_name VARCHAR(128),
  IN p_ddl TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table_name
      AND COLUMN_NAME = p_column_name
  ) THEN
    SET @ddl = p_ddl;
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

CREATE PROCEDURE sp_add_index_if_missing(
  IN p_table_name VARCHAR(128),
  IN p_index_name VARCHAR(128),
  IN p_non_unique TINYINT,
  IN p_column_names TEXT,
  IN p_ddl TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT
        TABLE_NAME,
        INDEX_NAME,
        NON_UNIQUE,
        GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS column_names
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
    ) AS existing_indexes
    WHERE existing_indexes.TABLE_NAME = p_table_name
      AND existing_indexes.NON_UNIQUE = p_non_unique
      AND existing_indexes.column_names = p_column_names
  ) THEN
    SET @ddl = p_ddl;
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

CREATE PROCEDURE sp_add_fk_if_missing(
  IN p_table_name VARCHAR(128),
  IN p_constraint_name VARCHAR(128),
  IN p_column_names TEXT,
  IN p_referenced_table_name VARCHAR(128),
  IN p_referenced_column_names TEXT,
  IN p_ddl TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT
        tc.TABLE_NAME,
        tc.CONSTRAINT_NAME,
        GROUP_CONCAT(kcu.COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION) AS column_names,
        kcu.REFERENCED_TABLE_NAME,
        GROUP_CONCAT(kcu.REFERENCED_COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION) AS referenced_column_names
      FROM information_schema.TABLE_CONSTRAINTS tc
      JOIN information_schema.KEY_COLUMN_USAGE kcu
        ON tc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
       AND tc.TABLE_NAME = kcu.TABLE_NAME
       AND tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      WHERE tc.TABLE_SCHEMA = DATABASE()
        AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
      GROUP BY tc.TABLE_NAME, tc.CONSTRAINT_NAME, kcu.REFERENCED_TABLE_NAME
    ) AS existing_fks
    WHERE existing_fks.TABLE_NAME = p_table_name
      AND existing_fks.column_names = p_column_names
      AND existing_fks.REFERENCED_TABLE_NAME = p_referenced_table_name
      AND existing_fks.referenced_column_names = p_referenced_column_names
  ) THEN
    SET @ddl = p_ddl;
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DELIMITER ;

CALL sp_add_column_if_missing('users', 'full_name', 'ALTER TABLE users ADD COLUMN full_name VARCHAR(100) NULL');
CALL sp_add_column_if_missing('users', 'role', 'ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT ''researcher''');
CALL sp_add_column_if_missing('users', 'is_active', 'ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1');
CALL sp_add_column_if_missing('users', 'is_superuser', 'ALTER TABLE users ADD COLUMN is_superuser TINYINT(1) NOT NULL DEFAULT 0');
CALL sp_add_column_if_missing('users', 'profile_image', 'ALTER TABLE users ADD COLUMN profile_image VARCHAR(255) NULL');
CALL sp_add_column_if_missing('users', 'created_at', 'ALTER TABLE users ADD COLUMN created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP');
CALL sp_add_index_if_missing('users', 'uq_users_email', 0, 'email', 'CREATE UNIQUE INDEX uq_users_email ON users (email)');
CALL sp_add_index_if_missing('users', 'uq_users_username', 0, 'username', 'CREATE UNIQUE INDEX uq_users_username ON users (username)');

CALL sp_add_column_if_missing('projects', 'task_type', 'ALTER TABLE projects ADD COLUMN task_type INT NULL');
CALL sp_add_column_if_missing('projects', 'model_type', 'ALTER TABLE projects ADD COLUMN model_type VARCHAR(20) NULL');
CALL sp_add_column_if_missing('projects', 'is_public', 'ALTER TABLE projects ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0');
CALL sp_add_column_if_missing('projects', 'owner_id', 'ALTER TABLE projects ADD COLUMN owner_id INT NULL');
CALL sp_add_column_if_missing('projects', 'created_at', 'ALTER TABLE projects ADD COLUMN created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP');
CALL sp_add_index_if_missing('projects', 'idx_projects_owner_id', 1, 'owner_id', 'CREATE INDEX idx_projects_owner_id ON projects (owner_id)');

CALL sp_add_column_if_missing('datasets', 'description', 'ALTER TABLE datasets ADD COLUMN description TEXT NULL');
CALL sp_add_column_if_missing('datasets', 'owner_id', 'ALTER TABLE datasets ADD COLUMN owner_id INT NULL');
CALL sp_add_column_if_missing('datasets', 'is_public', 'ALTER TABLE datasets ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0');
CALL sp_add_column_if_missing('datasets', 'current_version_id', 'ALTER TABLE datasets ADD COLUMN current_version_id INT NULL');
CALL sp_add_column_if_missing('datasets', 'created_at', 'ALTER TABLE datasets ADD COLUMN created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP');
CALL sp_add_index_if_missing('datasets', 'uq_datasets_slug', 0, 'slug', 'CREATE UNIQUE INDEX uq_datasets_slug ON datasets (slug)');
CALL sp_add_index_if_missing('datasets', 'idx_datasets_name', 1, 'name', 'CREATE INDEX idx_datasets_name ON datasets (name)');
CALL sp_add_index_if_missing('datasets', 'idx_datasets_owner_id', 1, 'owner_id', 'CREATE INDEX idx_datasets_owner_id ON datasets (owner_id)');
CALL sp_add_index_if_missing('datasets', 'idx_datasets_current_version_id', 1, 'current_version_id', 'CREATE INDEX idx_datasets_current_version_id ON datasets (current_version_id)');

CALL sp_add_column_if_missing('dataset_versions', 'lifecycle', 'ALTER TABLE dataset_versions ADD COLUMN lifecycle VARCHAR(20) NOT NULL DEFAULT ''draft''');
CALL sp_add_column_if_missing('dataset_versions', 'schema_version', 'ALTER TABLE dataset_versions ADD COLUMN schema_version VARCHAR(20) NULL DEFAULT ''2.0''');
CALL sp_add_column_if_missing('dataset_versions', 'summary_json', 'ALTER TABLE dataset_versions ADD COLUMN summary_json JSON NULL');
CALL sp_add_column_if_missing('dataset_versions', 'validation_json', 'ALTER TABLE dataset_versions ADD COLUMN validation_json JSON NULL');
CALL sp_add_column_if_missing('dataset_versions', 'source_files_json', 'ALTER TABLE dataset_versions ADD COLUMN source_files_json JSON NULL');
CALL sp_add_column_if_missing('dataset_versions', 'raw_blob_key', 'ALTER TABLE dataset_versions ADD COLUMN raw_blob_key VARCHAR(500) NULL');
CALL sp_add_column_if_missing('dataset_versions', 'processed_blob_key', 'ALTER TABLE dataset_versions ADD COLUMN processed_blob_key VARCHAR(500) NULL');
CALL sp_add_column_if_missing('dataset_versions', 'created_by', 'ALTER TABLE dataset_versions ADD COLUMN created_by INT NULL');
CALL sp_add_column_if_missing('dataset_versions', 'published_by', 'ALTER TABLE dataset_versions ADD COLUMN published_by INT NULL');
CALL sp_add_column_if_missing('dataset_versions', 'created_at', 'ALTER TABLE dataset_versions ADD COLUMN created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP');
CALL sp_add_column_if_missing('dataset_versions', 'published_at', 'ALTER TABLE dataset_versions ADD COLUMN published_at DATETIME NULL');
CALL sp_add_index_if_missing('dataset_versions', 'uq_dataset_version', 0, 'dataset_id,version', 'CREATE UNIQUE INDEX uq_dataset_version ON dataset_versions (dataset_id, version)');
CALL sp_add_index_if_missing('dataset_versions', 'idx_dataset_versions_dataset_id', 1, 'dataset_id', 'CREATE INDEX idx_dataset_versions_dataset_id ON dataset_versions (dataset_id)');
CALL sp_add_index_if_missing('dataset_versions', 'idx_dataset_versions_lifecycle', 1, 'lifecycle', 'CREATE INDEX idx_dataset_versions_lifecycle ON dataset_versions (lifecycle)');
CALL sp_add_index_if_missing('dataset_versions', 'idx_dataset_versions_created_by', 1, 'created_by', 'CREATE INDEX idx_dataset_versions_created_by ON dataset_versions (created_by)');
CALL sp_add_index_if_missing('dataset_versions', 'idx_dataset_versions_published_by', 1, 'published_by', 'CREATE INDEX idx_dataset_versions_published_by ON dataset_versions (published_by)');

CALL sp_add_column_if_missing('experiments', 'project_id', 'ALTER TABLE experiments ADD COLUMN project_id INT NULL');
CALL sp_add_column_if_missing('experiments', 'owner_id', 'ALTER TABLE experiments ADD COLUMN owner_id INT NULL');
CALL sp_add_column_if_missing('experiments', 'dataset_id', 'ALTER TABLE experiments ADD COLUMN dataset_id INT NULL');
CALL sp_add_column_if_missing('experiments', 'dataset_version_id', 'ALTER TABLE experiments ADD COLUMN dataset_version_id INT NULL');
CALL sp_add_column_if_missing('experiments', 'status', 'ALTER TABLE experiments ADD COLUMN status VARCHAR(20) NULL DEFAULT ''completed''');
CALL sp_add_column_if_missing('experiments', 'mongo_run_id', 'ALTER TABLE experiments ADD COLUMN mongo_run_id VARCHAR(100) NULL');
CALL sp_add_column_if_missing('experiments', 'mongo_graph_payload_id', 'ALTER TABLE experiments ADD COLUMN mongo_graph_payload_id VARCHAR(100) NULL');
CALL sp_add_column_if_missing('experiments', 'mongo_metrics_id', 'ALTER TABLE experiments ADD COLUMN mongo_metrics_id VARCHAR(100) NULL');
CALL sp_add_column_if_missing('experiments', 'config_json', 'ALTER TABLE experiments ADD COLUMN config_json JSON NULL');
CALL sp_add_column_if_missing('experiments', 'retention_state', 'ALTER TABLE experiments ADD COLUMN retention_state VARCHAR(20) NULL DEFAULT ''full''');
CALL sp_add_column_if_missing('experiments', 'notes', 'ALTER TABLE experiments ADD COLUMN notes TEXT NULL');
CALL sp_add_column_if_missing('experiments', 'is_best', 'ALTER TABLE experiments ADD COLUMN is_best TINYINT(1) NOT NULL DEFAULT 0');
CALL sp_add_column_if_missing('experiments', 'is_mock', 'ALTER TABLE experiments ADD COLUMN is_mock TINYINT(1) NOT NULL DEFAULT 0');
CALL sp_add_index_if_missing('experiments', 'idx_experiments_project_id', 1, 'project_id', 'CREATE INDEX idx_experiments_project_id ON experiments (project_id)');
CALL sp_add_index_if_missing('experiments', 'idx_experiments_owner_id', 1, 'owner_id', 'CREATE INDEX idx_experiments_owner_id ON experiments (owner_id)');
CALL sp_add_index_if_missing('experiments', 'idx_experiments_dataset_id', 1, 'dataset_id', 'CREATE INDEX idx_experiments_dataset_id ON experiments (dataset_id)');
CALL sp_add_index_if_missing('experiments', 'idx_experiments_dataset_version_id', 1, 'dataset_version_id', 'CREATE INDEX idx_experiments_dataset_version_id ON experiments (dataset_version_id)');
CALL sp_add_index_if_missing('experiments', 'idx_experiments_task_type', 1, 'task_type', 'CREATE INDEX idx_experiments_task_type ON experiments (task_type)');
CALL sp_add_index_if_missing('experiments', 'idx_experiments_model_type', 1, 'model_type', 'CREATE INDEX idx_experiments_model_type ON experiments (model_type)');
CALL sp_add_index_if_missing('experiments', 'idx_experiments_status', 1, 'status', 'CREATE INDEX idx_experiments_status ON experiments (status)');
CALL sp_add_index_if_missing('experiments', 'idx_experiments_mongo_run_id', 1, 'mongo_run_id', 'CREATE INDEX idx_experiments_mongo_run_id ON experiments (mongo_run_id)');
CALL sp_add_index_if_missing('experiments', 'idx_experiments_mongo_graph_payload_id', 1, 'mongo_graph_payload_id', 'CREATE INDEX idx_experiments_mongo_graph_payload_id ON experiments (mongo_graph_payload_id)');
CALL sp_add_index_if_missing('experiments', 'idx_experiments_mongo_metrics_id', 1, 'mongo_metrics_id', 'CREATE INDEX idx_experiments_mongo_metrics_id ON experiments (mongo_metrics_id)');
CALL sp_add_index_if_missing('experiments', 'idx_experiments_created_at', 1, 'created_at', 'CREATE INDEX idx_experiments_created_at ON experiments (created_at)');

CALL sp_add_column_if_missing('training_sessions', 'user_id', 'ALTER TABLE training_sessions ADD COLUMN user_id INT NULL');
CALL sp_add_column_if_missing('training_sessions', 'project_id', 'ALTER TABLE training_sessions ADD COLUMN project_id INT NULL');
CALL sp_add_column_if_missing('training_sessions', 'experiment_id', 'ALTER TABLE training_sessions ADD COLUMN experiment_id INT NULL');
CALL sp_add_column_if_missing('training_sessions', 'dataset_version_id', 'ALTER TABLE training_sessions ADD COLUMN dataset_version_id INT NULL');
CALL sp_add_column_if_missing('training_sessions', 'status', 'ALTER TABLE training_sessions ADD COLUMN status VARCHAR(20) NULL DEFAULT ''pending''');
CALL sp_add_column_if_missing('training_sessions', 'last_epoch', 'ALTER TABLE training_sessions ADD COLUMN last_epoch INT NULL DEFAULT -1');
CALL sp_add_column_if_missing('training_sessions', 'total_epochs', 'ALTER TABLE training_sessions ADD COLUMN total_epochs INT NULL DEFAULT 100');
CALL sp_add_column_if_missing('training_sessions', 'last_seq', 'ALTER TABLE training_sessions ADD COLUMN last_seq INT NULL DEFAULT 0');
CALL sp_add_column_if_missing('training_sessions', 'ended_at', 'ALTER TABLE training_sessions ADD COLUMN ended_at DATETIME NULL');
CALL sp_add_column_if_missing('training_sessions', 'error_message', 'ALTER TABLE training_sessions ADD COLUMN error_message TEXT NULL');
CALL sp_add_column_if_missing('training_sessions', 'mongo_run_id', 'ALTER TABLE training_sessions ADD COLUMN mongo_run_id VARCHAR(100) NULL');
CALL sp_add_column_if_missing('training_sessions', 'created_at', 'ALTER TABLE training_sessions ADD COLUMN created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP');
CALL sp_add_index_if_missing('training_sessions', 'idx_training_sessions_user_id', 1, 'user_id', 'CREATE INDEX idx_training_sessions_user_id ON training_sessions (user_id)');
CALL sp_add_index_if_missing('training_sessions', 'idx_training_sessions_project_id', 1, 'project_id', 'CREATE INDEX idx_training_sessions_project_id ON training_sessions (project_id)');
CALL sp_add_index_if_missing('training_sessions', 'idx_training_sessions_experiment_id', 1, 'experiment_id', 'CREATE INDEX idx_training_sessions_experiment_id ON training_sessions (experiment_id)');
CALL sp_add_index_if_missing('training_sessions', 'idx_training_sessions_dataset_version_id', 1, 'dataset_version_id', 'CREATE INDEX idx_training_sessions_dataset_version_id ON training_sessions (dataset_version_id)');
CALL sp_add_index_if_missing('training_sessions', 'idx_training_sessions_status', 1, 'status', 'CREATE INDEX idx_training_sessions_status ON training_sessions (status)');
CALL sp_add_index_if_missing('training_sessions', 'idx_training_sessions_mongo_run_id', 1, 'mongo_run_id', 'CREATE INDEX idx_training_sessions_mongo_run_id ON training_sessions (mongo_run_id)');

CALL sp_add_column_if_missing('session_snapshots', 'experiment_id', 'ALTER TABLE session_snapshots ADD COLUMN experiment_id INT NULL');
CALL sp_add_column_if_missing('session_snapshots', 'mongo_doc_id', 'ALTER TABLE session_snapshots ADD COLUMN mongo_doc_id VARCHAR(100) NULL');
CALL sp_add_column_if_missing('session_snapshots', 'blob_ref', 'ALTER TABLE session_snapshots ADD COLUMN blob_ref VARCHAR(500) NULL');
CALL sp_add_column_if_missing('session_snapshots', 'created_at', 'ALTER TABLE session_snapshots ADD COLUMN created_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP');
CALL sp_add_index_if_missing('session_snapshots', 'uq_session_epoch', 0, 'session_id,epoch', 'CREATE UNIQUE INDEX uq_session_epoch ON session_snapshots (session_id, epoch)');
CALL sp_add_index_if_missing('session_snapshots', 'idx_session_snapshots_experiment_id', 1, 'experiment_id', 'CREATE INDEX idx_session_snapshots_experiment_id ON session_snapshots (experiment_id)');

CALL sp_add_index_if_missing('audit_logs', 'idx_audit_logs_actor_user_id', 1, 'actor_user_id', 'CREATE INDEX idx_audit_logs_actor_user_id ON audit_logs (actor_user_id)');
CALL sp_add_index_if_missing('audit_logs', 'idx_audit_logs_action', 1, 'action', 'CREATE INDEX idx_audit_logs_action ON audit_logs (action)');
CALL sp_add_index_if_missing('audit_logs', 'idx_audit_logs_target_type', 1, 'target_type', 'CREATE INDEX idx_audit_logs_target_type ON audit_logs (target_type)');
CALL sp_add_index_if_missing('audit_logs', 'idx_audit_logs_created_at', 1, 'created_at', 'CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at)');

CALL sp_add_fk_if_missing('projects', 'fk_projects_owner_id', 'owner_id', 'users', 'id', 'ALTER TABLE projects ADD CONSTRAINT fk_projects_owner_id FOREIGN KEY (owner_id) REFERENCES users(id)');
CALL sp_add_fk_if_missing('datasets', 'fk_datasets_owner_id', 'owner_id', 'users', 'id', 'ALTER TABLE datasets ADD CONSTRAINT fk_datasets_owner_id FOREIGN KEY (owner_id) REFERENCES users(id)');
CALL sp_add_fk_if_missing('dataset_versions', 'fk_dataset_versions_dataset_id', 'dataset_id', 'datasets', 'id', 'ALTER TABLE dataset_versions ADD CONSTRAINT fk_dataset_versions_dataset_id FOREIGN KEY (dataset_id) REFERENCES datasets(id)');
CALL sp_add_fk_if_missing('dataset_versions', 'fk_dataset_versions_created_by', 'created_by', 'users', 'id', 'ALTER TABLE dataset_versions ADD CONSTRAINT fk_dataset_versions_created_by FOREIGN KEY (created_by) REFERENCES users(id)');
CALL sp_add_fk_if_missing('dataset_versions', 'fk_dataset_versions_published_by', 'published_by', 'users', 'id', 'ALTER TABLE dataset_versions ADD CONSTRAINT fk_dataset_versions_published_by FOREIGN KEY (published_by) REFERENCES users(id)');
CALL sp_add_fk_if_missing('datasets', 'fk_datasets_current_version_id', 'current_version_id', 'dataset_versions', 'id', 'ALTER TABLE datasets ADD CONSTRAINT fk_datasets_current_version_id FOREIGN KEY (current_version_id) REFERENCES dataset_versions(id)');
CALL sp_add_fk_if_missing('experiments', 'fk_experiments_project_id', 'project_id', 'projects', 'id', 'ALTER TABLE experiments ADD CONSTRAINT fk_experiments_project_id FOREIGN KEY (project_id) REFERENCES projects(id)');
CALL sp_add_fk_if_missing('experiments', 'fk_experiments_owner_id', 'owner_id', 'users', 'id', 'ALTER TABLE experiments ADD CONSTRAINT fk_experiments_owner_id FOREIGN KEY (owner_id) REFERENCES users(id)');
CALL sp_add_fk_if_missing('experiments', 'fk_experiments_dataset_id', 'dataset_id', 'datasets', 'id', 'ALTER TABLE experiments ADD CONSTRAINT fk_experiments_dataset_id FOREIGN KEY (dataset_id) REFERENCES datasets(id)');
CALL sp_add_fk_if_missing('experiments', 'fk_experiments_dataset_version_id', 'dataset_version_id', 'dataset_versions', 'id', 'ALTER TABLE experiments ADD CONSTRAINT fk_experiments_dataset_version_id FOREIGN KEY (dataset_version_id) REFERENCES dataset_versions(id)');
CALL sp_add_fk_if_missing('training_sessions', 'fk_training_sessions_user_id', 'user_id', 'users', 'id', 'ALTER TABLE training_sessions ADD CONSTRAINT fk_training_sessions_user_id FOREIGN KEY (user_id) REFERENCES users(id)');
CALL sp_add_fk_if_missing('training_sessions', 'fk_training_sessions_project_id', 'project_id', 'projects', 'id', 'ALTER TABLE training_sessions ADD CONSTRAINT fk_training_sessions_project_id FOREIGN KEY (project_id) REFERENCES projects(id)');
CALL sp_add_fk_if_missing('training_sessions', 'fk_training_sessions_experiment_id', 'experiment_id', 'experiments', 'id', 'ALTER TABLE training_sessions ADD CONSTRAINT fk_training_sessions_experiment_id FOREIGN KEY (experiment_id) REFERENCES experiments(id)');
CALL sp_add_fk_if_missing('training_sessions', 'fk_training_sessions_dataset_version_id', 'dataset_version_id', 'dataset_versions', 'id', 'ALTER TABLE training_sessions ADD CONSTRAINT fk_training_sessions_dataset_version_id FOREIGN KEY (dataset_version_id) REFERENCES dataset_versions(id)');
CALL sp_add_fk_if_missing('session_snapshots', 'fk_session_snapshots_session_id', 'session_id', 'training_sessions', 'id', 'ALTER TABLE session_snapshots ADD CONSTRAINT fk_session_snapshots_session_id FOREIGN KEY (session_id) REFERENCES training_sessions(id)');
CALL sp_add_fk_if_missing('session_snapshots', 'fk_session_snapshots_experiment_id', 'experiment_id', 'experiments', 'id', 'ALTER TABLE session_snapshots ADD CONSTRAINT fk_session_snapshots_experiment_id FOREIGN KEY (experiment_id) REFERENCES experiments(id)');
CALL sp_add_fk_if_missing('audit_logs', 'fk_audit_logs_actor_user_id', 'actor_user_id', 'users', 'id', 'ALTER TABLE audit_logs ADD CONSTRAINT fk_audit_logs_actor_user_id FOREIGN KEY (actor_user_id) REFERENCES users(id)');

DROP PROCEDURE IF EXISTS sp_add_column_if_missing;
DROP PROCEDURE IF EXISTS sp_add_index_if_missing;
DROP PROCEDURE IF EXISTS sp_add_fk_if_missing;

SET FOREIGN_KEY_CHECKS = 1;
