# `rdfjs-source-msaccess`

This library and CLI creates RDF quads from a Microsoft Access database (`.accdb` or `.mdb`).

## Usage

Run it without installing using e.g. `npx`: `$ npx @rdmr-eu/rdfjs-source-msaccess`.

Add it as a library with e.g. `$ yarn add @rdmr-eu/rdfjs-source-msaccess` and use the exported class:

```ts
const data = fs.readFileSync(inputFilePath);
const mdb = new MSAccessQuadGenerator(data, { baseIRI: "https://example.org/data#" });
const store = mdb.store(); // then use this RDF.Store in your code.
```

## Model

The generated quads are according to the Facade-X model (default) or a simpler csv-like model.

| Id (Long) | DateAdded (Date/Time) | ContentBody (Text with markup) | Published (Boolean) |
| --------- | --------------------- | ------------------------------ | ------------------- |
| 1         | 10-3-2023             | This is content                | Ja                  |
| 2         | 9-3-2023              | Old                            | Nee                 |

- With the above table, the mode `facade-x` (default) generates:

  ```trig
  <https://example.org/data#ContentTable> {
    [] rdf:type fx:root ;
      rdf:_1 _:ContentTable1 ;
      rdf:_2 _:ContentTable2 .

    _:ContentTable1 xyz:Id "1"^^xsd:long ;
      xyz:DateAdded "2023-03-10T00:00:00.000Z"^^xsd:dateTime ;
      xyz:ContentBody "<div>This is <strong>content</strong></div>" ;
      xyz:Published "true"^^xsd:boolean .

    _:ContentTable2 xyz:Id "2"^^xsd:long ;
      xyz:DateAdded "2023-03-09T00:00:00.000Z"^^xsd:dateTime ;
      xyz:ContentBody "<div><em>Old</em></div>" ;
      xyz:Published "false"^^xsd:boolean .
  }
  ```

  This is based on the [spreadsheet format for SPARQL-Anything](https://github.com/SPARQL-Anything/sparql.anything/blob/65580ec66fdfe85f7c7bb3ed0ed52ec6352e6164/formats/Spreadsheet.md).

- With the above tabe, the mode `csv` generates:

  ```trig
  <csv:table/ContentTable> {
    <csv:table/ContentTable/row/1> <csv:Id> "1"^^xsd:long ;
      <csv:DateAdded> "2023-03-10T00:00:00.000Z"^^xsd:dateTime ;
      <csv:ContentBody> "<div>This is <strong>content</strong></div>" ;
      <csv:Published> "true"^^xsd:boolean .

    <csv:table/ContentTable/row/2> <csv:Id> "2"^^xsd:long ;
      <csv:DateAdded> "2023-03-09T00:00:00.000Z"^^xsd:dateTime ;
      <csv:ContentBody> "<div><em>Old</em></div>" ;
      <csv:Published> "false"^^xsd:boolean .
  }
  ```
