import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'
import { initDatabase } from './migrations.js'

export const dbPath = join(app.getPath('userData'), 'gestion-contable.db')

export const db = new Database(dbPath)

initDatabase(db)
