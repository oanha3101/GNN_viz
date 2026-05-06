-- GNN-Insight MySQL cleanup for legacy duplicate constraints/indexes
-- Purpose:
--   - keep the named `fk_*`, `idx_*`, and `uq_*` conventions
--   - remove duplicate legacy `*_ibfk_*` foreign keys
--   - remove duplicate legacy `ix_*` indexes when an equivalent named index exists
--   - remove redundant `ix_*_id` indexes on primary keys

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP PROCEDURE IF EXISTS sp_drop_fk_if_exists;
DROP PROCEDURE IF EXISTS sp_drop_index_if_exists;

DELIMITER $$

CREATE PROCEDURE sp_drop_fk_if_exists(
  IN p_table_name VARCHAR(128),
  IN p_constraint_name VARCHAR(128)
)
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table_name
      AND CONSTRAINT_NAME = p_constraint_name
      AND CONSTRAINT_TYPE = 'FOREIGN KEY'
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE ', p_table_name, ' DROP FOREIGN KEY ', p_constraint_name);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

CREATE PROCEDURE sp_drop_index_if_exists(
  IN p_table_name VARCHAR(128),
  IN p_index_name VARCHAR(128)
)
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table_name
      AND INDEX_NAME = p_index_name
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE ', p_table_name, ' DROP INDEX ', p_index_name);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DELIMITER ;

-- legacy duplicate foreign keys
CALL sp_drop_fk_if_exists('audit_logs', 'audit_logs_ibfk_1');
CALL sp_drop_fk_if_exists('datasets', 'datasets_ibfk_1');
CALL sp_drop_fk_if_exists('datasets', 'datasets_ibfk_2');
CALL sp_drop_fk_if_exists('dataset_versions', 'dataset_versions_ibfk_1');
CALL sp_drop_fk_if_exists('dataset_versions', 'dataset_versions_ibfk_2');
CALL sp_drop_fk_if_exists('dataset_versions', 'dataset_versions_ibfk_3');
CALL sp_drop_fk_if_exists('experiments', 'experiments_ibfk_1');
CALL sp_drop_fk_if_exists('experiments', 'experiments_ibfk_2');
CALL sp_drop_fk_if_exists('experiments', 'experiments_ibfk_3');
CALL sp_drop_fk_if_exists('experiments', 'experiments_ibfk_4');
CALL sp_drop_fk_if_exists('projects', 'projects_ibfk_1');
CALL sp_drop_fk_if_exists('session_snapshots', 'session_snapshots_ibfk_1');
CALL sp_drop_fk_if_exists('session_snapshots', 'session_snapshots_ibfk_2');
CALL sp_drop_fk_if_exists('training_sessions', 'training_sessions_ibfk_1');
CALL sp_drop_fk_if_exists('training_sessions', 'training_sessions_ibfk_2');
CALL sp_drop_fk_if_exists('training_sessions', 'training_sessions_ibfk_3');
CALL sp_drop_fk_if_exists('training_sessions', 'training_sessions_ibfk_4');

-- duplicate legacy indexes
CALL sp_drop_index_if_exists('audit_logs', 'ix_audit_logs_action');
CALL sp_drop_index_if_exists('audit_logs', 'ix_audit_logs_actor_user_id');
CALL sp_drop_index_if_exists('audit_logs', 'ix_audit_logs_created_at');
CALL sp_drop_index_if_exists('audit_logs', 'ix_audit_logs_target_type');
CALL sp_drop_index_if_exists('datasets', 'ix_datasets_name');
CALL sp_drop_index_if_exists('datasets', 'ix_datasets_owner_id');
CALL sp_drop_index_if_exists('datasets', 'ix_datasets_slug');
CALL sp_drop_index_if_exists('dataset_versions', 'ix_dataset_versions_dataset_id');
CALL sp_drop_index_if_exists('dataset_versions', 'ix_dataset_versions_lifecycle');
CALL sp_drop_index_if_exists('experiments', 'ix_experiments_created_at');
CALL sp_drop_index_if_exists('experiments', 'ix_experiments_dataset_id');
CALL sp_drop_index_if_exists('experiments', 'ix_experiments_dataset_version_id');
CALL sp_drop_index_if_exists('experiments', 'ix_experiments_model_type');
CALL sp_drop_index_if_exists('experiments', 'ix_experiments_mongo_graph_payload_id');
CALL sp_drop_index_if_exists('experiments', 'ix_experiments_mongo_metrics_id');
CALL sp_drop_index_if_exists('experiments', 'ix_experiments_mongo_run_id');
CALL sp_drop_index_if_exists('experiments', 'ix_experiments_owner_id');
CALL sp_drop_index_if_exists('experiments', 'ix_experiments_project_id');
CALL sp_drop_index_if_exists('experiments', 'ix_experiments_status');
CALL sp_drop_index_if_exists('experiments', 'ix_experiments_task_type');
CALL sp_drop_index_if_exists('projects', 'ix_projects_owner_id');
CALL sp_drop_index_if_exists('session_snapshots', 'ix_session_snapshots_experiment_id');
CALL sp_drop_index_if_exists('training_sessions', 'ix_training_sessions_dataset_version_id');
CALL sp_drop_index_if_exists('training_sessions', 'ix_training_sessions_experiment_id');
CALL sp_drop_index_if_exists('training_sessions', 'ix_training_sessions_mongo_run_id');
CALL sp_drop_index_if_exists('training_sessions', 'ix_training_sessions_project_id');
CALL sp_drop_index_if_exists('training_sessions', 'ix_training_sessions_status');
CALL sp_drop_index_if_exists('training_sessions', 'ix_training_sessions_user_id');
CALL sp_drop_index_if_exists('users', 'ix_users_email');
CALL sp_drop_index_if_exists('users', 'ix_users_username');

-- redundant primary-key side indexes
CALL sp_drop_index_if_exists('audit_logs', 'ix_audit_logs_id');
CALL sp_drop_index_if_exists('datasets', 'ix_datasets_id');
CALL sp_drop_index_if_exists('dataset_versions', 'ix_dataset_versions_id');
CALL sp_drop_index_if_exists('experiments', 'ix_experiments_id');
CALL sp_drop_index_if_exists('projects', 'ix_projects_id');
CALL sp_drop_index_if_exists('users', 'ix_users_id');

DROP PROCEDURE IF EXISTS sp_drop_fk_if_exists;
DROP PROCEDURE IF EXISTS sp_drop_index_if_exists;

SET FOREIGN_KEY_CHECKS = 1;
