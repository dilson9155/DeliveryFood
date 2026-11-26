import { z } from "zod";

const phoneRegex = /^\d{10,11}$/;
const cpfRegex = /^\d{11}$/;
const cnpjRegex = /^\d{14}$/;

export const phoneSchema = z
  .string()
  .min(10, "Informe um telefone válido")
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => phoneRegex.test(v), "Informe um telefone válido com DDD");

/** Aceita CPF (11 dígitos) ou CNPJ (14 dígitos) formatado. Retorna só dígitos. */
export const taxIdSchema = z
  .string()
  .min(11, "CPF/CNPJ inválido")
  .max(18, "CPF/CNPJ inválido")
  .transform((v) => v.replace(/\D/g, ""))
  .refine(
    (v) => cpfRegex.test(v) || cnpjRegex.test(v),
    "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido"
  );

export const nameSchema = z.string().min(2, "Informe seu nome completo").max(120);

export const registerSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  taxId: taxIdSchema,
  email: z
    .union([z.string().email("E-mail inválido"), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? v.toLowerCase().trim() : null)),
  password: z
    .string()
    .min(6, "A senha deve ter pelo menos 6 caracteres")
    .max(72),
});

export const loginSchema = z.object({
  identifier: z.string().min(3, "Informe telefone ou e-mail"),
  password: z.string().min(1, "Informe a senha"),
});

export const forgotPasswordSchema = z.object({
  identifier: z.string().min(3, "Informe telefone ou e-mail"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(6, "A senha deve ter pelo menos 6 caracteres")
    .max(72),
});

export const productSchema = z.object({
  name: z.string().min(1, "Informe o nome").max(120),
  description: z.string().max(500).optional().nullable(),
  price: z.number().positive("Preço deve ser maior que zero"),
  categoryId: z.string().min(1, "Selecione a categoria"),
  imageUrl: z.string().url("URL inválida").optional().nullable().or(z.literal("")),
  featured: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export const categorySchema = z.object({
  name: z.string().min(1, "Informe o nome").max(80),
  description: z.string().max(300).optional().nullable(),
  icon: z.string().max(10).optional().nullable(),
  order: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

export const employeeSchema = z.object({
  name: z.string().min(2, "Informe o nome").max(120),
  phone: phoneSchema.optional().nullable(),
  email: z.union([z.string().email("E-mail inválido"), z.literal(""), z.null()]).optional(),
  login: z.string().min(3, "Login deve ter pelo menos 3 caracteres").max(40),
  password: z
    .string()
    .min(6, "A senha deve ter pelo menos 6 caracteres")
    .max(72)
    .optional()
    .or(z.literal("")),
  role: z.enum(["ADMIN", "MANAGER", "ATTENDANT", "KITCHEN", "CASHIER", "MOTOBOY"]),
  active: z.boolean().optional(),
});

export const settingsSchema = z.object({
  storeName: z.string().min(1).max(120),
  logoUrl: z
    .union([z.literal(""), z.string().trim().max(2_000_000)])
    .optional(),
  cnpj: z.string().max(30).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  whatsapp: z.string().max(30).optional().nullable(),
  email: z.union([z.string().email().or(z.literal(""))]).optional(),
  address: z.string().max(200).optional().nullable(),
  number: z.string().max(20).optional().nullable(),
  complement: z.string().max(100).optional().nullable(),
  neighborhood: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(2).optional().nullable(),
  zipCode: z.string().max(15).optional().nullable(),
  prepTimeMinutes: z.number().int().min(1).max(600).optional(),
  isManuallyOpen: z.union([z.boolean(), z.null()]).optional(),
  receiptMessage: z.string().max(300).optional().nullable(),
  receiptFooter: z.string().max(300).optional().nullable(),
  printTemplateId: z.enum(["thermal80", "thermal58", "thermal76", "a4"]).optional().nullable(),
});

export const businessHoursSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  open: z.boolean(),
  openTime: z.string().regex(/^\d{2}:\d{2}$/),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export const orderItemInputSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
  options: z
    .array(
      z.object({
        groupId: z.string().min(1),
        optionId: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
      })
    )
    .max(60)
    .optional(),
});

const deliveryAddressSchema = z.object({
  street: z.string().min(2).max(200),
  number: z.string().min(1).max(20),
  complement: z.string().max(80).optional().nullable(),
  neighborhood: z.string().min(2).max(80),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(2),
  zipCode: z.string().min(8).max(10),
});

export const createOrderSchema = z.object({
  items: z.array(orderItemInputSchema).min(1, "Carrinho vazio"),
  paymentMethod: z.enum(["CASH", "CARD", "PIX"]),
  observation: z.string().max(500).optional().nullable(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  delivery: z
    .object({
      mode: z.enum(["PICKUP", "DELIVERY"]),
      addressId: z.string().optional(),
      address: deliveryAddressSchema.optional(),
      distanceKm: z.number().optional(),
      fee: z.number().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    })
    .optional(),
});

/** Cliente criado em segundos no PDV: apenas nome e telefone são obrigatórios. */
export const quickCustomerSchema = z.object({
  name: z.string().min(2, "Informe o nome do cliente").max(120),
  phone: phoneSchema,
  email: z
    .union([z.string().email("E-mail inválido"), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? v.toLowerCase().trim() : null)),
  taxId: z
    .union([taxIdSchema, z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
});

/** Pedido montado pelo atendente no PDV (sem entrega, sem geolocalização). */
export const posOrderSchema = z.object({
  customerId: z.string().min(1, "Selecione ou cadastre um cliente"),
  items: z.array(orderItemInputSchema).min(1, "Carrinho vazio"),
  paymentMethod: z.enum(["CASH", "CARD", "PIX"]),
  paidNow: z.boolean().optional().default(false),
  observation: z.string().max(500).optional().nullable(),
});

export const cashMovementSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE", "WITHDRAWAL", "SUPPLY"]),
  amount: z.number().positive("Valor deve ser maior que zero"),
  description: z.string().max(200).optional().nullable(),
  paymentMethod: z.enum(["CASH", "CARD", "PIX"]).optional().nullable(),
});