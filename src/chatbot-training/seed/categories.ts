/**
 * Script import dữ liệu mẫu câu từ file maucau.md vào hệ thống Chatbot Training
 * Chạy: npx ts-node src/chatbot-training/seed-data.ts
 * Hoặc dùng endpoint POST /chatbot-training/seed
 */

export const SEED_CATEGORIES = [
  { name: 'Quy trình tư vấn', description: 'Các bước tư vấn khách hàng từ đầu đến cuối', icon: '📋' },
  { name: 'Báo giá & Chi phí', description: 'Thông tin giá niềng, gói niềng, ưu đãi', icon: '💰' },
  { name: 'Kiến thức niềng răng', description: 'Kiến thức về niềng khay trong suốt, ưu điểm, quy trình', icon: '🦷' },
  { name: 'Tình huống xử lý', description: 'Xử lý các trường hợp đặc biệt: khách ở tỉnh, trả góp, bảo hành...', icon: '🎯' },
  { name: 'Thông tin nha khoa', description: 'Địa chỉ, thời gian làm việc, liên hệ', icon: '🏥' },
  { name: 'Chăm sóc khách hàng', description: 'Mẫu câu CSKH, nhắc hẹn, follow up', icon: '💝' },
];
