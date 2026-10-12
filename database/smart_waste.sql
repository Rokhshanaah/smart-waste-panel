CREATE DATABASE IF NOT EXISTS smart_waste
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smart_waste;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS cash_box_transactions;
DROP TABLE IF EXISTS incomes;
DROP TABLE IF EXISTS income_categories;
DROP TABLE IF EXISTS complaints;
DROP TABLE IF EXISTS expenses;
DROP TABLE IF EXISTS recycling_records;
DROP TABLE IF EXISTS collection_schedules;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS bills;
DROP TABLE IF EXISTS trucks;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS areas;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(30) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','accountant','employee','driver','citizen') NOT NULL DEFAULT 'employee',
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  permissions LONGTEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE areas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  district VARCHAR(120) NOT NULL,
  monthly_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  house_count INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(190) NULL,
  citizen_code VARCHAR(80) NULL UNIQUE,
  province VARCHAR(100) NOT NULL DEFAULT 'هرات',
  city VARCHAR(100) NOT NULL DEFAULT 'هرات',
  district VARCHAR(100) NULL,
  area_id INT UNSIGNED NULL,
  street VARCHAR(100) NULL,
  alley VARCHAR(100) NULL,
  house_number VARCHAR(50) NULL,
  floor_number VARCHAR(50) NULL,
  unit_number VARCHAR(50) NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_customers_area FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE employees (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  job_title VARCHAR(120) NOT NULL,
  salary DECIMAL(12,2) NOT NULL DEFAULT 0,
  area_id INT UNSIGNED NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_employees_area FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE trucks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plate_number VARCHAR(80) NOT NULL UNIQUE,
  truck_type VARCHAR(120) NOT NULL,
  driver_name VARCHAR(150) NULL,
  area_id INT UNSIGNED NULL,
  monthly_rent DECIMAL(12,2) NOT NULL DEFAULT 0,
  fuel_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  repair_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('active','broken','repair','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_trucks_area FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE bills (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bill_number VARCHAR(80) NOT NULL UNIQUE,
  customer_id INT UNSIGNED NOT NULL,
  area_id INT UNSIGNED NULL,
  billing_type ENUM('weekly','monthly','quarterly','yearly') NOT NULL DEFAULT 'monthly',
  month_name VARCHAR(60) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  due_date DATE NULL,
  status ENUM('unpaid','partial','paid') NOT NULL DEFAULT 'unpaid',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bills_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bills_area FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bill_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'cash',
  receipt_number VARCHAR(80) NOT NULL UNIQUE,
  status ENUM('paid','cancelled') NOT NULL DEFAULT 'paid',
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_bill FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE collection_schedules (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  area_id INT UNSIGNED NOT NULL,
  days VARCHAR(190) NOT NULL,
  collection_time TIME NOT NULL,
  truck_id INT UNSIGNED NULL,
  employee_id INT UNSIGNED NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_schedule_area FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE CASCADE,
  CONSTRAINT fk_schedule_truck FOREIGN KEY (truck_id) REFERENCES trucks(id) ON DELETE SET NULL,
  CONSTRAINT fk_schedule_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE recycling_records (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  material_type ENUM('iron','plastic','aluminum','wood','glass','other') NOT NULL,
  weight_kg DECIMAL(12,2) NOT NULL,
  price_per_kg DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(12,2) GENERATED ALWAYS AS (weight_kg * price_per_kg) STORED,
  record_date DATE NOT NULL,
  transaction_type ENUM('stock','sale') NOT NULL DEFAULT 'stock',
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE expenses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(190) NOT NULL,
  category ENUM('salary','fuel','repair','rent','equipment','office','other') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  expense_date DATE NOT NULL,
  area_id INT UNSIGNED NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_expenses_area FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE complaints (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NULL,
  title VARCHAR(190) NOT NULL,
  complaint_type ENUM('truck_missing','waste_remaining','employee_issue','payment_issue','other') NOT NULL,
  description TEXT NOT NULL,
  address TEXT NULL,
  image_url VARCHAR(500) NULL,
  complaint_date DATE NOT NULL,
  status ENUM('new','reviewing','resolved','rejected') NOT NULL DEFAULT 'new',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_complaints_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE incomes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(190) NOT NULL,
  category VARCHAR(120) NOT NULL DEFAULT 'سایر',
  amount DECIMAL(12,2) NOT NULL,
  income_date DATE NOT NULL,
  payment_method VARCHAR(30) NOT NULL DEFAULT 'cash',
  customer_id INT UNSIGNED NULL,
  reference_type ENUM('payment','recycling','manual') NOT NULL DEFAULT 'manual',
  reference_id INT UNSIGNED NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_incomes_date (income_date),
  INDEX idx_incomes_ref (reference_type, reference_id)
) ENGINE=InnoDB;

CREATE TABLE income_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE cash_box_transactions (
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
  INDEX idx_collection_date (collection_date),
  CONSTRAINT fk_area_daily_area FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO areas (name, district, monthly_fee, house_count)
VALUES ('شهر نو', 'ناحیه ۵', 100, 2500),
       ('منطقه مرکزی', 'ناحیه ۳', 120, 1800);

INSERT INTO customers
(full_name, phone, email, citizen_code, province, city, district, area_id, alley, house_number)
VALUES
('احمد احمدی', '0701234567', 'ahmad@example.com', 'CIT-1001', 'هرات', 'هرات', 'ناحیه ۵', 1, '۱۲', '۴۵');

INSERT INTO employees (full_name, phone, job_title, salary, area_id)
VALUES ('محمد احمد', '0707654321', 'کارگر تنظیف', 8000, 1);

INSERT INTO trucks (plate_number, truck_type, driver_name, area_id, monthly_rent, fuel_cost, repair_cost)
VALUES ('HR-1234', 'کامیون زباله', 'علی', 1, 30000, 15000, 5000);

INSERT INTO bills (bill_number, customer_id, area_id, billing_type, month_name, amount, due_date)
VALUES ('BILL-1001', 1, 1, 'monthly', 'اسد', 100, CURRENT_DATE());

INSERT INTO collection_schedules (area_id, days, collection_time, truck_id, employee_id)
VALUES (1, 'شنبه، سه‌شنبه', '06:00:00', 1, 1);

INSERT INTO recycling_records (material_type, weight_kg, price_per_kg, record_date)
VALUES ('iron', 1000, 50, CURRENT_DATE()),
       ('plastic', 500, 20, CURRENT_DATE());

INSERT INTO expenses (title, category, amount, expense_date, area_id)
VALUES ('مصرف تیل موتر', 'fuel', 15000, CURRENT_DATE(), 1);

INSERT INTO complaints (customer_id, title, complaint_type, description, address, complaint_date)
VALUES (1, 'موتر تنظیف نیامده', 'truck_missing', 'موتر در روز تعیین‌شده به کوچه نیامد.', 'شهر نو، کوچه ۱۲', CURRENT_DATE());
