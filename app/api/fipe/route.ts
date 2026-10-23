import {NextRequest,NextResponse} from "next/server";
import {listFipeBrands,listFipeModels,type FipeVehicleType} from "../../../db/fipe";
const types:Record<string,FipeVehicleType>={carros:"cars",motos:"motorcycles",caminhoes:"trucks"};

export async function GET(request: NextRequest) {
  const legacy = request.nextUrl.searchParams.get("type") || "carros";
  const type=types[legacy];
  const brand = request.nextUrl.searchParams.get("brand");
  if(!type)return NextResponse.json({error:"Tipo inválido."},{status:400});
  if(brand){const models=await listFipeModels(type,`${type}:${brand}`);return NextResponse.json({models:models.map(item=>({code:item.externalCode,name:item.name}))});}
  const brands=await listFipeBrands(type);return NextResponse.json({brands:brands.map(item=>({id:item.id,code:item.externalCode,name:item.name}))});
}
