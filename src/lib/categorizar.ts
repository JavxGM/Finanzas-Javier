// ── Categorización de gastos — 100% local, sin llamadas externas ─────────────
//
// Estrategia: array de reglas ordenado por especificidad descendente.
// Las frases más largas/específicas se evalúan PRIMERO para evitar falsos
// positivos (ej: "UBER EATS" matchea antes que "UBER").
//
// Comparación: case-insensitive sobre la descripción normalizada a mayúsculas.
// El primer match gana — sin fallback externo, sin async.

export const CATEGORIAS_VALIDAS = [
  'Transporte',
  'Comida',
  'Supermercado',
  'Entretenimiento',
  'Telecomunicaciones',
  'Salud',
  'Ropa',
  'Servicios Hogar',
  'Bienestar',
  'Transferencia',
  'Otros',
] as const

export type Categoria = (typeof CATEGORIAS_VALIDAS)[number]

// MÁS ESPECÍFICAS PRIMERO — el orden dentro del array determina precedencia
const REGLAS: Array<{ keywords: string[]; categoria: Categoria }> = [
  // Delivery de comida (antes que "UBER" genérico)
  {
    keywords: ['UBER EATS', 'UBEREATS', 'RAPPI', 'YUMMY', 'DIDI FOOD', 'PEDIDOS YA'],
    categoria: 'Comida',
  },

  // Ride-hailing (después de delivery)
  {
    keywords: ['UBER', 'CABIFY', 'INDRIVER', 'IN DRIVER'],
    categoria: 'Transporte',
  },

  // Supermercados (antes que restaurantes genéricos para evitar falsos en "MERCADO X")
  {
    keywords: [
      'NACIONAL', 'LA SIRENA', 'BRAVO', 'CARREFOUR', 'PRICESMART',
      'JUMBO', 'PLAYERO', 'ECONOSUPERMARKET', 'SUPERMERCADO', 'COLMADO',
      'PLAZA LAMA', 'PREMIER',
    ],
    categoria: 'Supermercado',
  },

  // Restaurantes y comida (fast food, delivery, cafeterías)
  {
    keywords: [
      'KFC', 'PIZZA', 'BURGER', 'SUBWAY', 'MCDONALD', 'DOMINO',
      'POLLO', 'RESTAURANT', 'RESTAURANTE', 'CAFE', 'CAFETERIA',
      'PANADERIA', 'SUSHI', 'TACOS', 'WENDY', 'TACO BELL', 'CHIMI',
      'ASADERO', 'ASADOR', 'FRITURAS', 'COMEDOR', 'PAPA JOHN',
      'PIZZA HUT', 'BOCA CHICA',
    ],
    categoria: 'Comida',
  },

  // Gasolineras (antes que transporte genérico)
  {
    keywords: [
      'TEXACO', 'SHELL', 'PUMA ENERGY', 'ESSO', 'GASOLINERA',
      'GAS STATION', 'GULF', 'TOTALGAS', 'GLOBAL GAS', 'PDV',
      'ESTACION DE SERVICIO', 'SUNIX',
    ],
    categoria: 'Transporte',
  },

  // Telecomunicaciones
  {
    keywords: ['CLARO', 'WIND', 'ALTICE', 'VIVA', 'TRICOM'],
    categoria: 'Telecomunicaciones',
  },

  // Entretenimiento / streaming
  {
    keywords: [
      'NETFLIX', 'SPOTIFY', 'DISNEY', 'CRUNCHYROLL', 'AMAZON PRIME',
      'HBO', 'YOUTUBE', 'STEAM', 'PLAYSTATION', 'XBOX',
      'PARAMOUNT', 'DEEZER', 'TIDAL', 'TWITCH', 'APPLE',
    ],
    categoria: 'Entretenimiento',
  },

  // Salud y farmacias
  {
    keywords: [
      'FARMACIA', 'FARMACORP', 'CAROL', 'FARMAVIDA', 'CLINICA',
      'HOSPITAL', 'MEDICO', 'LABORATORIO', 'DENTAL', 'OPTICA',
    ],
    categoria: 'Salud',
  },

  // Servicios del hogar (electricidad, agua, seguros)
  {
    keywords: [
      'EDEESTE', 'EDENORTE', 'EDESUR', 'CAASD', 'INAPA',
      'GAS NATURAL', 'SEGUROS', 'SEGURO', 'LUZ', 'AGUA', 'INTERNET',
    ],
    categoria: 'Servicios Hogar',
  },

  // Bienestar (gym, barbería, spa)
  {
    keywords: [
      'GYM', 'GIMNASIO', 'FITNESS', 'BARBERIA', 'BARBERSHOP',
      'BARBER', 'SPA', 'SALON', 'BEAUTY', 'PELUQUERIA',
      'ESCUELA', 'COLEGIO', 'UNIVERSIDAD', 'ACADEMIA',
    ],
    categoria: 'Bienestar',
  },

  // Ropa y retail
  {
    keywords: [
      'ZARA', 'NIKE', 'ADIDAS', 'H&M', 'FOREVER 21', 'PULL',
      'MANGO', 'UNIQLO', 'ROPA', 'CALZADO', 'ZAPATERIA',
      'TOMMY', 'PRIMARK', 'BOUTIQUE',
    ],
    categoria: 'Ropa',
  },

  // Transferencias y cajeros
  {
    keywords: [
      'ATM', 'CAJERO', 'TRANSFERENCIA', 'PAGOFACIL', 'PAGO MOVIL',
      'RECARGAS', 'RETIRO', 'DEPOSITO', 'PAGO SERVICIO', 'PAGO EN LINEA',
    ],
    categoria: 'Transferencia',
  },
]

/**
 * Categoriza un gasto a partir de la descripción del comercio.
 * Síncrono, sin llamadas externas, sin await.
 *
 * Las reglas más específicas se evalúan primero — "UBER EATS" matchea
 * Comida antes de que "UBER" pueda matchear Transporte.
 */
export function categorizarGasto(descripcion: string): Categoria {
  const upper = descripcion.toUpperCase().trim()
  for (const regla of REGLAS) {
    if (regla.keywords.some((kw) => upper.includes(kw))) {
      return regla.categoria
    }
  }
  return 'Otros'
}

/**
 * Alias mantenido por compatibilidad con código legado.
 * Usar categorizarGasto directamente.
 */
export function categorizarGastoSync(descripcion: string, _comercio?: string): Categoria {
  return categorizarGasto(descripcion)
}
