import Database from "better-sqlite3"; import {schema} from "./migrations.js";
export class DatabaseContext {readonly db:Database.Database;constructor(file=":memory:"){this.db=new Database(file);this.db.exec(schema);}transaction<T>(fn:(db:Database.Database)=>T):T{return this.db.transaction(fn)(this.db);}}
