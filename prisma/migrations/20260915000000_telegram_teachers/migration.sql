-- DropForeignKey
ALTER TABLE `attendance_records` DROP FOREIGN KEY `attendance_records_created_by_id_fkey`;

-- DropForeignKey
ALTER TABLE `attendance_sessions` DROP FOREIGN KEY `attendance_sessions_taken_by_id_fkey`;

-- DropIndex
DROP INDEX `attendance_records_created_by_id_fkey` ON `attendance_records`;

-- DropIndex
DROP INDEX `attendance_sessions_taken_by_id_fkey` ON `attendance_sessions`;

-- AlterTable
ALTER TABLE `attendance_records` ADD COLUMN `teacher_id` INTEGER NULL,
    MODIFY `created_by_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `attendance_sessions` ADD COLUMN `teacher_id` INTEGER NULL,
    MODIFY `taken_by_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `teachers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branch_id` INTEGER NOT NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `subject` VARCHAR(100) NULL,
    `phone` VARCHAR(20) NULL,
    `email` VARCHAR(150) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `teachers_branch_id_idx`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci;

-- CreateTable
CREATE TABLE `branch_ai_settings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branch_id` INTEGER NOT NULL,
    `base_url` VARCHAR(255) NOT NULL,
    `api_key` VARCHAR(255) NOT NULL,
    `model` VARCHAR(100) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `branch_ai_settings_branch_id_key`(`branch_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci;

-- CreateTable
CREATE TABLE `telegram_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `chat_id` VARCHAR(32) NOT NULL,
    `username` VARCHAR(100) NULL,
    `full_name` VARCHAR(150) NULL,
    `branch_id` INTEGER NOT NULL,
    `user_id` INTEGER NULL,
    `teacher_id` INTEGER NULL,
    `linked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `telegram_accounts_chat_id_key`(`chat_id`),
    INDEX `telegram_accounts_user_id_idx`(`user_id`),
    INDEX `telegram_accounts_teacher_id_idx`(`teacher_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci;

-- CreateTable
CREATE TABLE `telegram_link_codes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(12) NOT NULL,
    `branch_id` INTEGER NOT NULL,
    `user_id` INTEGER NULL,
    `teacher_id` INTEGER NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `telegram_link_codes_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci;

-- CreateTable
CREATE TABLE `attendance_slips` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branch_id` INTEGER NOT NULL,
    `academic_year_id` INTEGER NOT NULL,
    `chat_id` VARCHAR(32) NOT NULL,
    `user_id` INTEGER NULL,
    `teacher_id` INTEGER NULL,
    `telegram_file_id` VARCHAR(255) NOT NULL,
    `preview_message_id` INTEGER NULL,
    `status` ENUM('PENDING', 'APPLIED', 'CANCELLED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `parsed` JSON NULL,
    `matched` JSON NULL,
    `error_message` VARCHAR(500) NULL,
    `applied_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `attendance_slips_branch_id_created_at_idx`(`branch_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci;

-- AddForeignKey
ALTER TABLE `teachers` ADD CONSTRAINT `teachers_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `branch_ai_settings` ADD CONSTRAINT `branch_ai_settings_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `telegram_accounts` ADD CONSTRAINT `telegram_accounts_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `telegram_accounts` ADD CONSTRAINT `telegram_accounts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `telegram_accounts` ADD CONSTRAINT `telegram_accounts_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `telegram_link_codes` ADD CONSTRAINT `telegram_link_codes_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `telegram_link_codes` ADD CONSTRAINT `telegram_link_codes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `telegram_link_codes` ADD CONSTRAINT `telegram_link_codes_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_slips` ADD CONSTRAINT `attendance_slips_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_slips` ADD CONSTRAINT `attendance_slips_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_slips` ADD CONSTRAINT `attendance_slips_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_taken_by_id_fkey` FOREIGN KEY (`taken_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `attendance_sessions_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

