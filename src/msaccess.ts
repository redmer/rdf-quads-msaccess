import * as RDF from "@rdfjs/types";
import MDBReader, { Options as MDBOptions } from "mdb-reader";
import { ColumnType } from "mdb-reader/lib/node/types.js";
import type { Value } from "mdb-reader/lib/types/types.js";
import N3 from "n3";
import { CSVNS, FX, RDFNS, XSD, XYZ } from "./prefixes.js";

/** Configuration options. */
export interface MSAccessConstructorOptions extends MDBOptions {
  /**
   * The modelling paradigm by which the quads are generated.
   *
   * `"facade-x"` (default) generates quads as SPARQL-Anything does, with blank nodes and RDF containers.
   * `"csv"` generates a quad per table per column per row value.
   */
  quadMode: "facade-x" | "csv";
  /** Base URI, required for the Façade-X ontology. */
  baseIRI: string;
  /** Used to create all the data model instances */
  dataFactory: RDF.DataFactory;
}

/** A Microsoft Access (.accdb/.mdb) database that is a source of RDF quads. */
export class MSAccess implements RDF.Source {
  #db: MDBReader;
  #quadMode: MSAccessConstructorOptions["quadMode"];
  #baseURI: string;
  #df: RDF.DataFactory;
  #store: N3.Store;

  /** Initialize the quad generator. */
  constructor(database: Buffer, options?: Partial<MSAccessConstructorOptions>) {
    this.#db = new MDBReader(database, options);

    // The data factory argument is required by RDF-JS
    this.#df = options.dataFactory ?? N3.DataFactory;
    this.#store = new N3.Store(undefined, { factory: this.#df });

    // Default mode is facade-x
    this.#quadMode = options.quadMode ?? "facade-x";
    this.#baseURI = options.baseIRI ?? "http://example.org/data#";
  }

  /** Generate quads. */
  *quads(): Generator<RDF.Quad> {
    if (this.#quadMode == "csv") yield* this.csvQuads();
    else if (this.#quadMode == "facade-x") yield* this.facadeXQuads();
  }

  /** Iterate directly over all quads. */
  *[Symbol.iterator]() {
    yield* this.quads();
  }

  /** Generate quads and store them in a RDF-JS Store (cached). */
  store(): RDF.Store {
    if (this.#store.size) return this.#store;
    for (const quad of this.quads()) this.#store.addQuad(quad);
    return this.#store;
  }

  /** Implement the RDF-JS Source interface and match quads selectively (cached). */
  match(
    subject?: RDF.Term,
    predicate?: RDF.Term,
    object?: RDF.Term,
    graph?: RDF.Term
  ): RDF.Stream<RDF.Quad> {
    // TODO: This isn't really streaming...
    const store = this.store();
    return store.match(subject, predicate, object, graph);
  }

  /** Generate quads with a model akin to Facade-X. */
  private *facadeXQuads() {
    const TABLE = this.#baseURI;

    for (const tableName of this.#db.getTableNames()) {
      const tableData = this.#db.getTable(tableName);

      const graph = this.#df.namedNode(TABLE + encodeURI(tableName));
      const table = this.#df.blankNode(encodeURI(tableName));

      yield this.#df.quad(table, RDFNS("type"), FX("root"), graph);

      let i_row = 1;
      for (const record of this.#db.getTable(tableName).getData()) {
        const row = this.#df.blankNode(encodeURI(tableName) + i_row);

        yield this.#df.quad(table, RDFNS(`_${i_row}`), row, graph);

        for (const [column, value] of Object.entries(record)) {
          if (value == null) continue; // null values not imported
          const columnType = tableData.getColumn(column).type;

          const predicate = XYZ(encodeURI(column));
          const object = this.mdbValueToObject(value, columnType);

          yield this.#df.quad(row, predicate, object, graph);
        }
        i_row++;
      }
    }
  }

  /** Generate <csv:> quads. */
  private *csvQuads() {
    for (const tableName of this.#db.getTableNames()) {
      const table = this.#db.getTable(tableName);
      // Each table is a used as a graph
      const context = CSVNS(`table/${encodeURI(tableName)}`);

      // Row number (1-indexed, as in UI) for subject @id
      let i_row = 1;

      for (const record of this.#db.getTable(tableName).getData()) {
        for (const [column, value] of Object.entries(record)) {
          const columnType = table.getColumn(column).type;
          if (value == null) continue; // null values not imported

          const subject = CSVNS(`table/${encodeURI(tableName)}/row/${i_row}`);
          const predicate = CSVNS(encodeURI(column));
          const object = this.mdbValueToObject(value, columnType);

          yield this.#df.quad(subject, predicate, object, context);
        }
        i_row++;
      }
    }
  }

  /** Convert a MDB value to a RDF value with a specific datatype */
  mdbValueToObject(value: Value, columnType: ColumnType): RDF.Literal {
    // TODO: Not all datatypes have been checked with what Access produces
    const conv: Record<ColumnType, (v: Value) => [string, N3.NamedNode]> = {
      [ColumnType.BigInt]: (v: bigint) => [v.toString(), XSD("integer")],
      [ColumnType.Binary]: (v: Buffer) => [v.toString("base64"), XSD("base64Binary")],
      [ColumnType.Boolean]: (v: boolean) => [v ? "true" : "false", XSD("boolean")],
      [ColumnType.Byte]: (v: number) => [v.toString(), XSD("byte")],
      [ColumnType.Complex]: (v: number) => [v.toString(), XSD("number")],
      [ColumnType.Currency]: (v: string) => [v, XSD("string")],
      [ColumnType.DateTime]: (v: Date) => [v.toISOString(), XSD("dateTime")],
      [ColumnType.DateTimeExtended]: (v: string) => [v, XSD("string")],
      [ColumnType.Double]: (v: number) => [v.toString(), XSD("double")],
      [ColumnType.Float]: (v: number) => [v.toString(), XSD("float")],
      [ColumnType.Integer]: (v: number) => [v.toFixed(0), XSD("int")],
      [ColumnType.Long]: (v: number) => [v.toFixed(0), XSD("long")],
      [ColumnType.Memo]: (v: string) => [v, XSD("string")],
      [ColumnType.Numeric]: (v: string) => [v, XSD("string")],
      [ColumnType.OLE]: (v: Buffer) => [v.toString("base64"), XSD("base64Binary")],
      [ColumnType.RepID]: (v: string) => [v, XSD("string")],
      [ColumnType.Text]: (v: string) => [v, XSD("string")],
    };

    try {
      const [nativeValue, languageOrDatatype] = conv[columnType](value);
      return this.#df.literal(nativeValue, languageOrDatatype);
    } catch (e) {
      return this.#df.literal(value as string);
    }
  }
}

export class MsAccessQuadsError extends Error {}
