#!/usr/bin/env node
import N3 from "n3";
import fs from "node:fs";
import stream from "node:stream";
import { pathToFileURL } from "node:url";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { MSAccess, MSAccessConstructorOptions } from "./msaccess.js";

/** Run the quad generator and supply the CLI-arguments' buffers and context etc. */
export default async function run(
  inputFilePath: string,
  outFD: stream.Writable,
  password: string,
  quadMode: MSAccessConstructorOptions["quadMode"],
  baseIRI: string
) {
  const buffer = fs.readFileSync(inputFilePath);
  const mdb = new MSAccess(buffer, {
    password,
    quadMode,
    baseIRI: baseIRI ?? pathToFileURL(inputFilePath).href + "#",
  });
  const store = mdb.store();
  const streaming = store.match() as unknown as stream.Stream;

  streaming.pipe(new N3.StreamWriter({ format: "nquads" })).pipe(outFD);
}

export async function cli() {
  const argv = await yargs(hideBin(process.argv))
    .option("input", { alias: "i", type: "string", description: "Database file" })
    .demandOption("input")
    .option("output", { alias: "o", type: "string", description: "Output quads file" })
    .normalize(["input", "output"])
    .option("password", { type: "string", description: "Password for the protected database" })
    .requiresArg("password")
    .option("mode", { type: "string", description: "Model used to generate quads" })
    .choices("mode", ["facade-x", "csv"])
    .option("base", { type: "string", description: "Base IRI for the Facade-X generated data" })
    .help()
    .parse();

  const OUT = argv.output
    ? fs.createWriteStream(argv.output, { encoding: "utf-8" })
    : process.stdout;

  await run(
    argv.input,
    OUT,
    argv.password,
    argv.mode as MSAccessConstructorOptions["quadMode"],
    argv.base
  );
}

try {
  void (await cli());
} catch (e) {
  console.error(e.message ?? e);
  process.exit(1);
}
