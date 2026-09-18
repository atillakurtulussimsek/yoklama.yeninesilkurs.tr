-- AlterTable
ALTER TABLE `attendance_contact_logs` ADD COLUMN `exam_attendance_id` INTEGER NULL,
    MODIFY `record_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `exams` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branch_id` INTEGER NOT NULL,
    `academic_year_id` INTEGER NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `date` DATE NOT NULL,
    `note` VARCHAR(255) NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `exams_branch_id_date_idx`(`branch_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci;

-- CreateTable
CREATE TABLE `exam_class_groups` (
    `exam_id` INTEGER NOT NULL,
    `class_group_id` INTEGER NOT NULL,

    PRIMARY KEY (`exam_id`, `class_group_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci;

-- CreateTable
CREATE TABLE `exam_sessions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `exam_id` INTEGER NOT NULL,
    `class_group_id` INTEGER NOT NULL,
    `taken_by_id` INTEGER NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `exam_sessions_exam_id_class_group_id_key`(`exam_id`, `class_group_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci;

-- CreateTable
CREATE TABLE `exam_attendances` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `exam_id` INTEGER NOT NULL,
    `enrollment_id` INTEGER NOT NULL,
    `status` ENUM('ABSENT', 'LATE', 'EARLY_LEAVE', 'EXCUSED') NOT NULL,
    `note` VARCHAR(255) NULL,
    `created_by_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `exam_attendances_enrollment_id_idx`(`enrollment_id`),
    UNIQUE INDEX `exam_attendances_exam_id_enrollment_id_key`(`exam_id`, `enrollment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci;

-- CreateIndex
CREATE INDEX `attendance_contact_logs_exam_attendance_id_idx` ON `attendance_contact_logs`(`exam_attendance_id`);

-- AddForeignKey
ALTER TABLE `attendance_contact_logs` ADD CONSTRAINT `attendance_contact_logs_exam_attendance_id_fkey` FOREIGN KEY (`exam_attendance_id`) REFERENCES `exam_attendances`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exams` ADD CONSTRAINT `exams_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exams` ADD CONSTRAINT `exams_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_class_groups` ADD CONSTRAINT `exam_class_groups_exam_id_fkey` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_class_groups` ADD CONSTRAINT `exam_class_groups_class_group_id_fkey` FOREIGN KEY (`class_group_id`) REFERENCES `class_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_sessions` ADD CONSTRAINT `exam_sessions_exam_id_fkey` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_sessions` ADD CONSTRAINT `exam_sessions_class_group_id_fkey` FOREIGN KEY (`class_group_id`) REFERENCES `class_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_attendances` ADD CONSTRAINT `exam_attendances_exam_id_fkey` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_attendances` ADD CONSTRAINT `exam_attendances_enrollment_id_fkey` FOREIGN KEY (`enrollment_id`) REFERENCES `student_enrollments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

