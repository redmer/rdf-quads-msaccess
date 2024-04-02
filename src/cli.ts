#!/usr/bin/env node
import N3 from "n3";
import fs from "node:fs";
import { PassThrough, pipeline as streampipeline } from "node:stream";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createGzip } from "node:zlib";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { MSAccess } from "./msaccess.js";

const pipeline = promisify(streampipeline);

export async function cli() {
  const argv = await yargs(hideBin(process.argv))
    .option("input", { alias: "i", description: "Database file" })
    .demandOption("input")
    .option("output", { alias: "o", description: "Output quads file" })
    .normalize(["input", "output"])
    .option("password", { description: "Password for the protected database" })
    .requiresArg("password")
    .option("mode", { description: "Model used to generate quads" })
    .choices("mode", ["facade-x", "csv"])
    .option("base", { description: "Base IRI for the Facade-X generated data" })
    .alias("base", "base-iri")
    .option("datatypes", { desc: "Change column datatypes for easier SPARQL", type: "string" })
    .choices("datatypes", ["original", "easy-sparql"])
    .default("datatypes", "original")
    .strictOptions()
    .help()
    .parse();

  const OUT = argv.output
    ? fs.createWriteStream(argv.output, { encoding: "utf-8" })
    : process.stdout;
  const wantsGzip = argv.output?.endsWith(".gz");

  const buffer = fs.readFileSync(argv.input);
  const parser = new MSAccess(buffer, {
    password: argv.password as string,
    quadMode: argv.mode as unknown as any,
    baseIRI: (argv.base as string) ?? pathToFileURL(argv.input).href + "#",
    datatypeMode: argv.datatypes as unknown as any,
  });
  const writer = new N3.StreamWriter({ format: "nquads" });

  try {
    pipeline(parser, writer, wantsGzip ? createGzip() : new PassThrough(), OUT);
  } catch (err) {
    console.error(err);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) void cli();
