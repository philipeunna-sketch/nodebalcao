import Page from "../../institutional-page";export default async function CustomPage({params}:{params:Promise<{slug:string}>}){return <Page slug={(await params).slug}/>;}
