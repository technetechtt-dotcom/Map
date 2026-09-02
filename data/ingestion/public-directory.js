/**
 * Attributable public-directory records for national connectors.
 * City-centre / campus-centre quality only. Not field-verified.
 * Sources: DHET public university list, provincial .gov.za nodes, SETA/TIA/IDC public sites.
 */
function row(externalId, name, provinceSlug, lat, lng, categorySlug, summary, website) {
  return {
    externalId,
    name,
    provinceSlug,
    latitude: lat,
    longitude: lng,
    categorySlug,
    summary,
    website,
    sourceUrl: website,
    address: null,
  };
}

const universities = [
  row("uct", "University of Cape Town", "western-cape", -33.957, 18.461, "skills-education", "Public university (DHET). Directory pin at Rondebosch campus-centre quality.", "https://www.uct.ac.za/"),
  row("sun", "Stellenbosch University", "western-cape", -33.932, 18.864, "skills-education", "Public university (DHET).", "https://www.sun.ac.za/"),
  row("cput", "Cape Peninsula University of Technology", "western-cape", -33.932, 18.424, "skills-education", "Public university of technology (DHET).", "https://www.cput.ac.za/"),
  row("uwc", "University of the Western Cape", "western-cape", -33.933, 18.628, "skills-education", "Public university (DHET).", "https://www.uwc.ac.za/"),
  row("nmu", "Nelson Mandela University", "eastern-cape", -34.009, 25.67, "skills-education", "Public university (DHET).", "https://www.mandela.ac.za/"),
  row("ufh", "University of Fort Hare", "eastern-cape", -32.785, 26.846, "skills-education", "Public university (DHET).", "https://www.ufh.ac.za/"),
  row("wsu", "Walter Sisulu University", "eastern-cape", -31.588, 28.79, "skills-education", "Public university (DHET).", "https://www.wsu.ac.za/"),
  row("ru", "Rhodes University", "eastern-cape", -33.31, 26.52, "skills-education", "Public university (DHET) in Makhanda.", "https://www.ru.ac.za/"),
  row("ufs", "University of the Free State", "free-state", -29.108, 26.185, "skills-education", "Public university (DHET).", "https://www.ufs.ac.za/"),
  row("cut", "Central University of Technology", "free-state", -29.121, 26.214, "skills-education", "Public university of technology (DHET).", "https://www.cut.ac.za/"),
  row("wits", "University of the Witwatersrand", "gauteng", -26.191, 28.03, "skills-education", "Public university (DHET).", "https://www.wits.ac.za/"),
  row("up", "University of Pretoria", "gauteng", -25.754, 28.231, "skills-education", "Public university (DHET).", "https://www.up.ac.za/"),
  row("uj", "University of Johannesburg", "gauteng", -26.183, 27.998, "skills-education", "Public university (DHET).", "https://www.uj.ac.za/"),
  row("tut", "Tshwane University of Technology", "gauteng", -25.732, 28.164, "skills-education", "Public university of technology (DHET).", "https://www.tut.ac.za/"),
  row("unisa", "University of South Africa", "gauteng", -25.767, 28.2, "skills-education", "Public distance university (DHET).", "https://www.unisa.ac.za/"),
  row("smu", "Sefako Makgatho Health Sciences University", "gauteng", -25.619, 28.016, "skills-education", "Public health sciences university (DHET).", "https://www.smu.ac.za/"),
  row("vut", "Vaal University of Technology", "gauteng", -26.696, 27.837, "skills-education", "Public university of technology (DHET).", "https://www.vut.ac.za/"),
  row("ukzn", "University of KwaZulu-Natal", "kwazulu-natal", -29.867, 30.98, "skills-education", "Public university (DHET).", "https://ukzn.ac.za/"),
  row("dut", "Durban University of Technology", "kwazulu-natal", -29.852, 31.007, "skills-education", "Public university of technology (DHET).", "https://www.dut.ac.za/"),
  row("mut", "Mangosuthu University of Technology", "kwazulu-natal", -29.97, 30.914, "skills-education", "Public university of technology (DHET).", "https://www.mut.ac.za/"),
  row("unizulu", "University of Zululand", "kwazulu-natal", -28.854, 31.85, "skills-education", "Public university (DHET).", "https://www.unizulu.ac.za/"),
  row("ul", "University of Limpopo", "limpopo", -23.886, 29.738, "skills-education", "Public university (DHET).", "https://www.ul.ac.za/"),
  row("univen", "University of Venda", "limpopo", -22.975, 30.446, "skills-education", "Public university (DHET).", "https://www.univen.ac.za/"),
  row("ump", "University of Mpumalanga", "mpumalanga", -25.436, 30.985, "skills-education", "Public university (DHET).", "https://www.ump.ac.za/"),
  row("nwu", "North-West University", "north-west", -26.693, 27.093, "skills-education", "Public university (DHET).", "https://www.nwu.ac.za/"),
  row("spu", "Sol Plaatje University", "northern-cape", -28.728, 24.75, "skills-education", "Public university (DHET) in Kimberley.", "https://www.spu.ac.za/"),
];

const tvet = [
  row("false-bay-tvet", "False Bay TVET College", "western-cape", -34.09, 18.47, "skills-education", "Public TVET college.", "https://www.falsebaycollege.co.za/"),
  row("college-cape-town", "College of Cape Town", "western-cape", -33.925, 18.424, "skills-education", "Public TVET college.", "https://www.cct.edu.za/"),
  row("buffalo-city-tvet", "Buffalo City TVET College", "eastern-cape", -32.97, 27.87, "skills-education", "Public TVET college.", "https://www.bccollege.co.za/"),
  row("motheo-tvet", "Motheo TVET College", "free-state", -29.121, 26.214, "skills-education", "Public TVET college.", "https://www.motheotvet.co.za/"),
  row("tshwane-north-tvet", "Tshwane North TVET College", "gauteng", -25.746, 28.188, "skills-education", "Public TVET college.", "https://www.tnc.edu.za/"),
  row("ekurhuleni-west-tvet", "Ekurhuleni West TVET College", "gauteng", -26.25, 28.17, "skills-education", "Public TVET college.", "https://www.ewc.edu.za/"),
  row("coastal-kzn-tvet", "Coastal KZN TVET College", "kwazulu-natal", -29.858, 31.029, "skills-education", "Public TVET college.", "https://www.coastalkzn.co.za/"),
  row("capricorn-tvet", "Capricorn TVET College", "limpopo", -23.904, 29.469, "skills-education", "Public TVET college.", "https://www.capricorncollege.co.za/"),
  row("ehlanzeni-tvet", "Ehlanzeni TVET College", "mpumalanga", -25.465, 30.985, "skills-education", "Public TVET college.", "https://www.ehlanzenicollege.co.za/"),
  row("orbit-tvet", "Orbit TVET College", "north-west", -25.67, 27.24, "skills-education", "Public TVET college.", "https://www.orbitcollege.co.za/"),
  row("nc-rural-tvet", "Northern Cape Rural TVET College", "northern-cape", -28.45, 21.26, "skills-education", "Public TVET college (Upington campus-centre).", "https://ncrvet.com/"),
  row("nc-urban-tvet", "Northern Cape Urban TVET College", "northern-cape", -28.728, 24.75, "skills-education", "Public TVET college in Kimberley.", "https://ncutvet.edu.za/"),
];

const provincial = [
  row("wc-gov", "Western Cape Government", "western-cape", -33.925, 18.424, "knowledge-hub", "Provincial government digital services node.", "https://www.westerncape.gov.za/"),
  row("ec-gov", "Eastern Cape Provincial Government", "eastern-cape", -32.983, 27.867, "knowledge-hub", "Provincial government node in Bhisho.", "https://ecprov.gov.za/"),
  row("fs-gov", "Free State Provincial Government", "free-state", -29.121, 26.214, "knowledge-hub", "Provincial government node in Bloemfontein.", "https://www.freestateonline.fs.gov.za/"),
  row("gp-gov", "Gauteng Provincial Government", "gauteng", -25.746, 28.188, "knowledge-hub", "Provincial government digital services node.", "https://www.gauteng.gov.za/"),
  row("kzn-gov", "KwaZulu-Natal Provincial Government", "kwazulu-natal", -29.6, 30.38, "knowledge-hub", "Provincial government node in Pietermaritzburg.", "https://www.kznonline.gov.za/"),
  row("lp-gov", "Limpopo Provincial Government", "limpopo", -23.904, 29.469, "knowledge-hub", "Provincial government node in Polokwane.", "https://www.limpopo.gov.za/"),
  row("mp-gov", "Mpumalanga Provincial Government", "mpumalanga", -25.465, 30.985, "knowledge-hub", "Provincial government node in Mbombela.", "https://www.mpg.gov.za/"),
  row("nw-gov", "North West Provincial Government", "north-west", -25.865, 25.644, "knowledge-hub", "Provincial government node in Mahikeng.", "https://www.nwpg.gov.za/"),
  row("nc-gov", "Northern Cape Provincial Government", "northern-cape", -28.738, 24.763, "knowledge-hub", "Provincial government node in Kimberley.", "https://www.northern-cape.gov.za/"),
];

const municipalities = [
  row("cpt-metro", "City of Cape Town", "western-cape", -33.925, 18.424, "knowledge-hub", "Metropolitan municipality ICT / digital city programmes.", "https://www.capetown.gov.za/"),
  row("jhb-metro", "City of Johannesburg", "gauteng", -26.205, 28.05, "knowledge-hub", "Metropolitan municipality.", "https://www.joburg.org.za/"),
  row("tshwane-metro", "City of Tshwane", "gauteng", -25.746, 28.188, "knowledge-hub", "Metropolitan municipality.", "https://www.tshwane.gov.za/"),
  row("ekurhuleni-metro", "City of Ekurhuleni", "gauteng", -26.178, 28.246, "knowledge-hub", "Metropolitan municipality.", "https://www.ekurhuleni.gov.za/"),
  row("eth-metro", "eThekwini Municipality", "kwazulu-natal", -29.858, 31.029, "knowledge-hub", "Metropolitan municipality.", "https://www.durban.gov.za/"),
  row("nmb-metro", "Nelson Mandela Bay Municipality", "eastern-cape", -33.961, 25.62, "knowledge-hub", "Metropolitan municipality.", "https://www.nelsonmandelabay.gov.za/"),
  row("bc-metro", "Buffalo City Metropolitan Municipality", "eastern-cape", -32.97, 27.87, "knowledge-hub", "Metropolitan municipality.", "https://www.buffalocity.gov.za/"),
  row("mangaung-metro", "Mangaung Metropolitan Municipality", "free-state", -29.121, 26.214, "knowledge-hub", "Metropolitan municipality.", "https://www.mangaung.co.za/"),
  row("sol-plaatje", "Sol Plaatje Local Municipality", "northern-cape", -28.738, 24.763, "knowledge-hub", "Kimberley local municipality.", "https://www.solplaatje.org.za/"),
  row("dawid-kruiper", "Dawid Kruiper Local Municipality", "northern-cape", -28.447, 21.256, "knowledge-hub", "Upington local municipality.", "https://www.dawidkruiper.gov.za/"),
];

const research = [
  row("csir", "CSIR Pretoria", "gauteng", -25.747, 28.277, "knowledge-hub", "Public science council.", "https://www.csir.co.za/"),
  row("hsrc", "Human Sciences Research Council", "gauteng", -25.746, 28.188, "knowledge-hub", "Statutory research council.", "https://hsrc.ac.za/"),
  row("nrf", "National Research Foundation", "gauteng", -25.747, 28.277, "knowledge-hub", "Public science funding agency.", "https://www.nrf.ac.za/"),
  row("sarao", "SARAO", "western-cape", -33.935, 18.467, "ska-data", "SARAO headquarters / programme node (Cape Town). Carnarvon field site is a separate NC pin.", "https://www.sarao.ac.za/"),
  row("assaf", "Academy of Science of South Africa", "gauteng", -25.746, 28.188, "knowledge-hub", "Statutory science academy.", "https://www.assaf.org.za/"),
  row("mrc", "South African Medical Research Council", "western-cape", -33.906, 18.496, "knowledge-hub", "Statutory medical research council.", "https://www.samrc.ac.za/"),
];

const hubs = [
  row("innovation-hub", "The Innovation Hub", "gauteng", -25.747, 28.277, "knowledge-hub", "Gauteng innovation precinct.", "https://www.theinnovationhub.com/"),
  row("tshimologong", "Tshimologong Precinct", "gauteng", -26.192, 28.03, "knowledge-hub", "Wits digital innovation precinct, Braamfontein.", "https://tshimologong.joburg/"),
  row("bandwidth-barn", "Bandwidth Barn", "western-cape", -33.921, 18.422, "knowledge-hub", "Cape Innovation and Technology Initiative incubator.", "https://www.citi.org.za/"),
  row("silicon-cape", "Silicon Cape", "western-cape", -33.925, 18.424, "knowledge-hub", "Western Cape tech community organisation.", "https://www.siliconcape.com/"),
  row("mlab-nc", "mLab Northern Cape", "northern-cape", -28.738, 24.763, "knowledge-hub", "mLab NC digital skills and innovation node (PDF-backed).", "https://www.mlab.co.za/"),
  row("launchlab", "SU LaunchLab", "western-cape", -33.932, 18.864, "knowledge-hub", "Stellenbosch University business incubator.", "https://www.launchlab.co.za/"),
];

const setaFunders = [
  row("mict-seta", "MICT SETA", "gauteng", -26.107, 28.057, "skills-education", "Media, Information and Communication Technologies SETA.", "https://www.mict.org.za/"),
  row("merseta", "merSETA", "gauteng", -26.107, 28.057, "skills-education", "Manufacturing, Engineering and Related Services SETA.", "https://www.merseta.org.za/"),
  row("tia", "Technology Innovation Agency", "gauteng", -25.747, 28.277, "knowledge-hub", "Public technology innovation agency.", "https://www.tia.org.za/"),
  row("idc", "Industrial Development Corporation", "gauteng", -26.107, 28.057, "knowledge-hub", "Public development finance institution.", "https://www.idc.co.za/"),
  row("nef", "National Empowerment Fund", "gauteng", -26.107, 28.057, "knowledge-hub", "Public development finance institution.", "https://www.nefcorp.co.za/"),
  row("sefa", "sefa", "gauteng", -25.746, 28.188, "knowledge-hub", "Small Enterprise Finance Agency.", "https://www.sefa.org.za/"),
  row("nyda", "National Youth Development Agency", "gauteng", -26.107, 28.057, "knowledge-hub", "Public youth development agency.", "https://www.nyda.gov.za/"),
  row("nrf-fund", "NRF funding programmes", "gauteng", -25.747, 28.277, "knowledge-hub", "Public research funding programmes.", "https://www.nrf.ac.za/"),
];

const funders = [
  row("dsi", "Department of Science, Technology and Innovation", "gauteng", -25.746, 28.188, "knowledge-hub", "National public science and innovation department.", "https://www.dsti.gov.za/"),
  row("dtic", "Department of Trade, Industry and Competition", "gauteng", -25.746, 28.188, "knowledge-hub", "National public industrial policy department.", "https://www.thedtic.gov.za/"),
  row("dsbd", "Department of Small Business Development", "gauteng", -25.746, 28.188, "knowledge-hub", "National public small-business department.", "https://www.dsbd.gov.za/"),
];

const programmes = [
  row("codetribe", "mLab CodeTribe Academy", "gauteng", -25.747, 28.277, "skills-education", "Public-facing digital skills academy (mLab).", "https://www.mlab.co.za/"),
  row("wethinkcode", "WeThinkCode_", "gauteng", -26.192, 28.03, "skills-education", "Tuition-free software engineering academy.", "https://www.wethinkcode.co.za/"),
  row("capaciti", "CapaCiTi", "western-cape", -33.925, 18.424, "skills-education", "Cape Innovation and Technology Initiative skills programmes.", "https://capaciti.org.za/"),
];

const procurement = [
  row("etenders", "National Treasury eTender Publication Portal", "gauteng", -25.746, 28.188, "knowledge-hub", "Official public tender publication portal — not a single tender.", "https://www.etenders.gov.za/"),
  row("sita", "SITA", "gauteng", -25.746, 28.188, "knowledge-hub", "State Information Technology Agency procurement and services.", "https://www.sita.co.za/"),
];

const digitalInfra = [
  row("infraco", "Broadband Infraco", "gauteng", -26.107, 28.057, "knowledge-hub", "State-owned broadband infrastructure company.", "https://www.infraco.co.za/"),
  row("sentech", "SENTECH", "gauteng", -26.107, 28.057, "knowledge-hub", "State-owned broadcast and connectivity infrastructure.", "https://www.sentech.co.za/"),
  row("icasa", "ICASA", "gauteng", -25.746, 28.188, "knowledge-hub", "Independent Communications Authority of South Africa.", "https://www.icasa.org.za/"),
  row("ska-carnarvon", "SKA / MeerKAT site (Carnarvon)", "northern-cape", -30.971, 21.98, "ska-data", "Radio astronomy infrastructure node (town-centre directory quality).", "https://www.sarao.ac.za/"),
];

const industry = [
  row("iitpsa", "IITPSA", "gauteng", -26.107, 28.057, "knowledge-hub", "Institute of Information Technology Professionals South Africa.", "https://www.iitpsa.org.za/"),
  row("isaca-sa", "ISACA South Africa", "gauteng", -26.107, 28.057, "knowledge-hub", "Information systems audit and control association (SA chapter).", "https://engage.isaca.org/southafricachapter/home"),
  row("cssa", "Computer Society of South Africa via IITPSA", "gauteng", -26.107, 28.057, "knowledge-hub", "Professional ICT body (historical CSSA now IITPSA).", "https://www.iitpsa.org.za/"),
];

const companies = {
  records: [],
  note: "Company listings require a data-sharing agreement or a community submission. This bucket is intentionally empty of scraped commercial directories.",
};

const connectors = {
  universities,
  tvet,
  "provincial-government": provincial,
  municipalities,
  "research-institutions": research,
  "innovation-hubs": hubs,
  "seta-funders": setaFunders,
  funders,
  programmes,
  procurement,
  "digital-infrastructure": digitalInfra,
  "industry-bodies": industry,
  companies,
};

module.exports = { retrievedAt: "2026-09-02", sourceVersion: "public-directory-2026-09", connectors };
