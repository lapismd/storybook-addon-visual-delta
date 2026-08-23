const required = "2.9.5";

if (Deno.version.deno !== required) {
  console.error(`Deno ${required} is required; found ${Deno.version.deno}.`);
  Deno.exit(1);
}

console.log(`Deno ${required} verified.`);
