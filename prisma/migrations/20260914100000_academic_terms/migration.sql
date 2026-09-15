-- AlterTable
ALTER TABLE `academic_years` MODIFY `ends_on` DATE NULL;

-- CreateTable
CREATE TABLE `academic_terms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `academic_year_id` INTEGER NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `starts_on` DATE NOT NULL,
    `ends_on` DATE NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `academic_terms_academic_year_id_name_key`(`academic_year_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_turkish_ci;

-- AddForeignKey
ALTER TABLE `academic_terms` ADD CONSTRAINT `academic_terms_academic_year_id_fkey` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

