-- AlterTable
ALTER TABLE `lesson_periods` ADD COLUMN `session` ENUM('MORNING', 'AFTERNOON') NOT NULL DEFAULT 'MORNING';


-- Mevcut derslerde 5 ve sonrası öğleden sonra sayılır
UPDATE `lesson_periods` SET `session` = 'AFTERNOON' WHERE `order_no` >= 5;
