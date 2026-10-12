-- Migration: finance modules (safe to run on existing DB)
USE smart_waste;

CREATE TABLE IF NOT EXISTS incomes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(190) NOT NULL,
  category ENUM('service_fee','material_sale','donation','other') NOT NULL DEFAULT 'other',
  amount DECIMAL(12,2) NOT NULL,
  income_date DATE NOT NULL,
  payment_method ENUM('cash','bank','online') NOT NULL DEFAULT 'cash',
  reference_type ENUM('payment','recycling','manual') NOT NULL DEFAULT 'manual',
  reference_id INT UNSIGNED NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_incomes_date (income_date),
  INDEX idx_incomes_ref (reference_type, reference_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cash_box_transactions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(190) NOT NULL,
  direction ENUM('in','out') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  transaction_date DATE NOT NULL,
  category ENUM('payment','expense','material_sale','income','adjustment','other') NOT NULL DEFAULT 'other',
  reference_type VARCHAR(40) NULL,
  reference_id INT UNSIGNED NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_cash_date (transaction_date),
  INDEX idx_cash_ref (reference_type, reference_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS area_daily_collections (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  area_id INT UNSIGNED NOT NULL,
  collection_date DATE NOT NULL,
  houses_collected INT UNSIGNED NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_area_day (area_id, collection_date),
  INDEX idx_collection_date (collection_date)
) ENGINE=InnoDB;
