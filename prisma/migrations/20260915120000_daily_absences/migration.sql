-- CreateTable
CREATE TABLE `daily_absences` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `enrollment_id` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `kind` ENUM('FULL_DAY', 'HALF_DAY', 'LATE', 'EXCUSED') NOT NULL,
    `days` DECIMAL(2, 1) NOT NULL,
    `session` ENUM('MORNING', 'AFTERNOON') NULL,
    `late_count` INTEGER NOT NULL DEFAULT 0,
    `detail` VARCHAR(255) NULL,
    `note` VARCHAR(500) NULL,
    `manual` BOOLEAN NOT NULL DEFAULT false,
    `updated_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `daily_absences_date_idx`(`date`),
    UNIQUE INDEX `daily_absences_enrollment_id_date_key`(`enrollment_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci;

-- AddForeignKey
ALTER TABLE `daily_absences` ADD CONSTRAINT `daily_absences_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `student_enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

