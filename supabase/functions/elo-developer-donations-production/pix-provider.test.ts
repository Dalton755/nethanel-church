import { chooseActivePixKey,validateProductionPixInput } from "./pix-provider.ts";
import { strict as assert } from "node:assert";

const cycleId="b1eac62a-8194-495e-a385-927c84738301";
Deno.test("real Pix: chave ativa é escolhida sem rede",()=>{
 assert.equal(chooseActivePixKey({data:[
  {status:"DISABLED",key:"not_real_key"},
  {status:"ACTIVE",key:"pix_key_123456789"},
 ]}),"pix_key_123456789");
 assert.equal(chooseActivePixKey({data:[]}),null);
 assert.equal(chooseActivePixKey({data:[{status:"ACTIVE",key:"a"}]}),null);
});
Deno.test("real Pix: somente API key de produção aceita",()=>{
 assert.doesNotThrow(()=>validateProductionPixInput("$aact_prod_TEST_ONLY_NOT_REAL",500,cycleId));
 assert.throws(()=>validateProductionPixInput("$aact_hmlg_fake",500,cycleId));
 assert.throws(()=>validateProductionPixInput("",500,cycleId));
});
Deno.test("real Pix: valores R$5 a R$50mil",()=>{
 for(const cents of [0,499,5000001,500.1,NaN]){
  assert.throws(()=>validateProductionPixInput("$aact_prod_FAKE",cents,cycleId));
 }
});
Deno.test("real Pix: código externo deve ser UUID",()=>{
 assert.throws(()=>validateProductionPixInput("$aact_prod_FAKE",500,"x"));
});
