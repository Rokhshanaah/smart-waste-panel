-- Hierarchy: ناحیه → گذر → کوچه → خانه(پلاک)
-- Applied automatically on API startup via ensureGeoTables()

CREATE TABLE IF NOT EXISTS districts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_district_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS passages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  district_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_passage_district_name (district_id, name),
  CONSTRAINT fk_passages_district FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS alleys (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  passage_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_alley_passage_name (passage_id, name),
  CONSTRAINT fk_alleys_passage FOREIGN KEY (passage_id) REFERENCES passages(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS houses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  alley_id INT UNSIGNED NOT NULL,
  plate_number VARCHAR(60) NOT NULL,
  fee_amount DECIMAL(12,2) NOT NULL DEFAULT 120,
  owner_name VARCHAR(150) NULL,
  phone VARCHAR(30) NULL,
  notes TEXT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_house_alley_plate (alley_id, plate_number),
  CONSTRAINT fk_houses_alley FOREIGN KEY (alley_id) REFERENCES alleys(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS house_fee_payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  house_id INT UNSIGNED NOT NULL,
  fee_period VARCHAR(7) NOT NULL,
  amount DECIMAL(12,2) NOT NULL DEFAULT 120,
  status ENUM('unpaid','paid') NOT NULL DEFAULT 'unpaid',
  paid_at DATETIME NULL,
  payment_method VARCHAR(30) NULL DEFAULT 'cash',
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_house_period (house_id, fee_period),
  CONSTRAINT fk_house_fees_house FOREIGN KEY (house_id) REFERENCES houses(id) ON DELETE CASCADE
) ENGINE=InnoDB;
