// Seed: demo kingdoms around the world so the multiplayer map is alive.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const DEMO_KINGDOMS = [
  { name: "Aarav Mehta", kingdomName: "Aurora Citadel", phone: null, email: "aarav.demo@scholarskingdom.app", country: "India", grade: 10, board: "CBSE", subjects: ["Mathematics", "Science", "English"], coins: 1240, lat: 28.6149, lng: 77.2085, locationName: "New Delhi, India", avatarSeed: "aarav" },
  { name: "Diya Sharma", kingdomName: "Moonspire Keep", phone: null, email: "diya.demo@scholarskingdom.app", country: "India", grade: 9, board: "CBSE", subjects: ["Mathematics", "Science"], coins: 860, lat: 19.077, lng: 72.874, locationName: "Mumbai, India", avatarSeed: "diya" },
  { name: "Rohan Iyer", kingdomName: "Dragonreach", phone: null, email: "rohan.demo@scholarskingdom.app", country: "India", grade: 8, board: "ICSE", subjects: ["Mathematics", "Physics", "Computer Science"], coins: 640, lat: 12.973, lng: 77.590, locationName: "Bengaluru, India", avatarSeed: "rohan" },
  { name: "Oliver Bennett", kingdomName: "Thornwood Court", phone: null, email: "oliver.demo@scholarskingdom.app", country: "United Kingdom", grade: 11, board: "AQA GCSE", subjects: ["Mathematics", "Chemistry", "Biology"], coins: 2180, lat: 51.508, lng: -0.125, locationName: "London, UK", avatarSeed: "oliver" },
  { name: "Sophia Chen", kingdomName: "Starfall Palace", phone: null, email: "sophia.demo@scholarskingdom.app", country: "Singapore", grade: 10, board: "MOE Secondary", subjects: ["Mathematics", "Chemistry", "Economics"], coins: 1560, lat: 1.354, lng: 103.821, locationName: "Singapore", avatarSeed: "sophia" },
  { name: "Emma Wilson", kingdomName: "Ivory Gate", phone: null, email: "emma.demo@scholarskingdom.app", country: "United States", grade: 7, board: "Common Core", subjects: ["Mathematics", "English", "Science"], coins: 480, lat: 40.715, lng: -74.002, locationName: "New York, USA", avatarSeed: "emma" },
  { name: "Liam Taylor", kingdomName: "Frosthold", phone: null, email: "liam.demo@scholarskingdom.app", country: "Australia", grade: 12, board: "HSC (NSW)", subjects: ["Physics", "Mathematics", "Biology"], coins: 3020, lat: -33.866, lng: 151.211, locationName: "Sydney, Australia", avatarSeed: "liam" },
  { name: "Zara Ahmed", kingdomName: "Emberwatch", phone: null, email: "zara.demo@scholarskingdom.app", country: "United Arab Emirates", grade: 9, board: "CBSE (UAE)", subjects: ["Mathematics", "Science"], coins: 720, lat: 25.207, lng: 55.273, locationName: "Dubai, UAE", avatarSeed: "zara" },
  { name: "Noah Tremblay", kingdomName: "Mistvale", phone: null, email: "noah.demo@scholarskingdom.app", country: "Canada", grade: 11, board: "Ontario Curriculum", subjects: ["Mathematics", "Computer Science"], coins: 1340, lat: 43.656, lng: -79.381, locationName: "Toronto, Canada", avatarSeed: "noah" },
  { name: "Yuki Tanaka", kingdomName: "Sakura Stronghold", phone: null, email: "yuki.demo@scholarskingdom.app", country: "Japan", grade: 10, board: "Japanese National Curriculum", subjects: ["Mathematics", "English"], coins: 980, lat: 35.679, lng: 139.646, locationName: "Tokyo, Japan", avatarSeed: "yuki" },
  { name: "Lena Müller", kingdomName: "Wolfsburg Hall", phone: null, email: "lena.demo@scholarskingdom.app", country: "Germany", grade: 8, board: "German Gymnasium", subjects: ["Mathematics", "English"], coins: 560, lat: 52.523, lng: 13.408, locationName: "Berlin, Germany", avatarSeed: "lena" },
  { name: "Gabriel Silva", kingdomName: "Verdant Bastion", phone: null, email: "gabriel.demo@scholarskingdom.app", country: "Brazil", grade: 9, board: "BNCC (Base Nacional Comum)", subjects: ["Mathematics", "Science"], coins: 890, lat: -23.548, lng: -46.630, locationName: "São Paulo, Brazil", avatarSeed: "gabriel" },
  { name: "Amara Okafor", kingdomName: "Sunspire", phone: null, email: "amara.demo@scholarskingdom.app", country: "Global / Other", grade: 12, board: "Cambridge IGCSE", subjects: ["Biology", "Chemistry"], coins: 1650, lat: -1.294, lng: 36.819, locationName: "Nairobi, Kenya", avatarSeed: "amara" },
  { name: "Thabo Nkosi", kingdomName: "Goldcrest Keep", phone: null, email: "thabo.demo@scholarskingdom.app", country: "South Africa", grade: 10, board: "CAPS (National Curriculum)", subjects: ["Mathematics", "Physical Sciences"], coins: 1120, lat: -33.927, lng: 18.421, locationName: "Cape Town, South Africa", avatarSeed: "thabo" },
  { name: "Ji-woo Park", kingdomName: "Crystal Throne", phone: null, email: "jiwoo.demo@scholarskingdom.app", country: "Global / Other", grade: 9, board: "IB MYP", subjects: ["Mathematics", "Science"], coins: 760, lat: 37.569, lng: 126.974, locationName: "Seoul, South Korea", avatarSeed: "jiwoo" },
];

async function main() {
  const count = await db.user.count({ where: { isDemo: true } });
  if (count > 0) {
    console.log(`Seed skipped — ${count} demo kingdoms already exist.`);
    return;
  }
  for (const k of DEMO_KINGDOMS) {
    await db.user.create({
      data: {
        name: k.name,
        kingdomName: k.kingdomName,
        email: k.email,
        country: k.country,
        grade: k.grade,
        board: k.board,
        subjects: JSON.stringify(k.subjects),
        coins: k.coins,
        lat: k.lat,
        lng: k.lng,
        locationName: k.locationName,
        avatarSeed: k.avatarSeed,
        onboarded: true,
        isDemo: true,
      },
    });
  }
  console.log(`Seeded ${DEMO_KINGDOMS.length} demo kingdoms.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
