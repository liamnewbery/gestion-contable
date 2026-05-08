export function initDatabase(db) {
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS personas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      dni TEXT UNIQUE,
      email TEXT UNIQUE,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pacientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      persona_id INTEGER NOT NULL REFERENCES personas(id),
      precio_base REAL,
      frecuencia_pago TEXT CHECK (frecuencia_pago IN ('mensual', 'semanal', 'quincenal')),
      precio_es_especial INTEGER NOT NULL DEFAULT 0,
      activo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS alumnos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      persona_id INTEGER NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (persona_id) REFERENCES personas(id)
    );

    CREATE TABLE IF NOT EXISTS alumnos_particulares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      persona_id INTEGER NOT NULL REFERENCES personas(id),
      tipo_clase TEXT NOT NULL CHECK (tipo_clase IN ('tarot', 'astrologia', 'filosofia')),
      precio_base REAL,
      frecuencia_pago TEXT CHECK (frecuencia_pago IN ('mensual', 'semanal', 'quincenal')),
      precio_es_especial INTEGER NOT NULL DEFAULT 0,
      activo INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS grupos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      tipo_clase TEXT NOT NULL CHECK (tipo_clase IN ('tarot', 'astrologia', 'filosofia')),
      modalidad TEXT NOT NULL CHECK (modalidad IN ('presencial', 'online')),
      dia TEXT NOT NULL CHECK (dia IN ('lunes','martes','miercoles','jueves','viernes','sabado','domingo')),
      horario TEXT NOT NULL,
      precio_base REAL,
      frecuencia_pago TEXT CHECK (frecuencia_pago IN ('mensual', 'semanal', 'quincenal')),
      activo INTEGER NOT NULL DEFAULT 1,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS alumno_grupo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alumno_id INTEGER NOT NULL,
      grupo_id INTEGER NOT NULL,
      precio_override REAL,
      precio_es_especial INTEGER NOT NULL DEFAULT 0,
      ingreso_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      egreso_en DATETIME,
      UNIQUE (alumno_id, grupo_id),
      FOREIGN KEY (alumno_id) REFERENCES alumnos(id),
      FOREIGN KEY (grupo_id) REFERENCES grupos(id)
    );

    CREATE TABLE IF NOT EXISTS pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      persona_id INTEGER NOT NULL,
      rol_tipo TEXT NOT NULL CHECK (rol_tipo IN ('paciente', 'alumno')),
      rol_id INTEGER NOT NULL,
      monto REAL NOT NULL,
      fecha_pago TEXT NOT NULL,
      periodo_cubierto TEXT,
      origen TEXT NOT NULL CHECK (origen IN ('ia', 'manual', 'efectivo')),
      mail_uid TEXT UNIQUE,
      confianza_ia REAL,
      estado TEXT NOT NULL CHECK (estado IN ('confirmado', 'revision', 'rechazado')),
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (persona_id) REFERENCES personas(id)
    );

    CREATE TABLE IF NOT EXISTS historial_precios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rol_tipo TEXT NOT NULL,
      rol_id INTEGER NOT NULL,
      precio_anterior REAL,
      precio_nuevo REAL,
      es_especial INTEGER,
      alcance TEXT NOT NULL CHECK (alcance IN ('general', 'grupo', 'individual')),
      tipo_servicio TEXT,
      aplicado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      motivo TEXT
    );

    CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT
    );
  `)
}
