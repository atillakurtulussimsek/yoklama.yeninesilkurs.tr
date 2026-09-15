"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { PROJECT } from "@/lib/auth";
import { createSession, deleteSession } from "@/lib/session";

export type LoginState = { error?: string } | undefined;

const loginSchema = z.object({
  username: z.string().trim().min(1, "Kullanıcı adı gerekli"),
  password: z.string().min(1, "Şifre gerekli"),
});

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const user = await prisma.user.findUnique({
    where: { username: parsed.data.username.toLowerCase() },
    include: { projectRoles: { where: { project: PROJECT } } },
  });
  const valid = user && user.isActive && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!valid) return { error: "Kullanıcı adı veya şifre hatalı" };
  if (user.projectRoles.length === 0) return { error: "Yoklama sistemine erişim yetkiniz yok" };

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession({ userId: user.id });
  redirect("/");
}

const setupSchema = z.object({
  fullName: z.string().trim().min(2, "Ad soyad gerekli"),
  username: z
    .string()
    .trim()
    .min(3, "Kullanıcı adı en az 3 karakter olmalı")
    .regex(/^[a-zA-Z0-9._-]+$/, "Kullanıcı adında yalnızca harf, rakam, . _ - kullanılabilir"),
  password: z.string().min(8, "Şifre en az 8 karakter olmalı"),
});

/** Bu projede hiç yönetici yokken ilk yöneticiyi oluşturur. */
export async function setupAdmin(_state: LoginState, formData: FormData): Promise<LoginState> {
  if ((await prisma.userProjectRole.count({ where: { project: PROJECT, role: "ADMIN" } })) > 0) {
    return { error: "Kurulum zaten yapılmış" };
  }

  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const username = parsed.data.username.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    // Ortak tabloda zaten olan hesaba yetki vermek için şifresi doğrulanmalı
    if (!(await bcrypt.compare(parsed.data.password, existing.passwordHash))) {
      return { error: "Bu kullanıcı adı başka projede kayıtlı; o hesabın şifresini girin" };
    }
  }

  const user =
    existing ??
    (await prisma.user.create({
      data: {
        fullName: parsed.data.fullName,
        username,
        passwordHash: await bcrypt.hash(parsed.data.password, 10),
      },
    }));
  await prisma.userProjectRole.create({ data: { userId: user.id, project: PROJECT, role: "ADMIN" } });

  await createSession({ userId: user.id });
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/giris");
}
