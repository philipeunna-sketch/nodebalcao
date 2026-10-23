import {NextResponse} from "next/server";import {activeBanners} from "../../../db/banners";
export async function GET(request:Request){const placement=new URL(request.url).searchParams.get("placement")||"";return NextResponse.json({banners:await activeBanners(placement)},{headers:{"Cache-Control":"public, max-age=30"}});}
