export const SEED_PHRASES_TINHUONG = [
  // ===== TÌNH HUỐNG XỬ LÝ =====
  {
    category: 'Tình huống xử lý',
    intent: 'kh_o_tinh',
    user_message: 'Tôi ở tỉnh có niềng được không?',
    bot_response: 'Mình ở tỉnh thì vẫn có thể ghé bên em niềng vẫn được ạ. Vì niềng khay trong suốt mình sẽ linh động đeo niềng tại nhà theo dõi qua app. Tầm 3 - 4 tháng mới tái khám sẽ tiết kiệm khoảng thời gian di chuyển khi niềng. Khay niềng nhỏ gọn mang theo người vì vậy khách ở tỉnh hay đi du học vẫn niềng được.',
    keywords: ['ở tỉnh', 'xa', 'du học', 'đi xa'],
  },
  {
    category: 'Tình huống xử lý',
    intent: 'kh_chua_chup_film',
    user_message: 'Tôi chưa chụp film bao giờ',
    bot_response: 'Chị chưa từng chụp film lần nào thì khi ghé bên em thăm khám chị cần lên phác đồ 3D về kết quả niềng và quá trình niềng thì mình sẽ scan và chụp film ạ.',
    keywords: ['chụp film', 'xquang', 'chưa chụp'],
  },
  {
    category: 'Tình huống xử lý',
    intent: 'kh_co_film_roi',
    user_message: 'Tôi đã chụp film rồi',
    bot_response: 'Chị có chụp film xquang răng rồi thì giờ mình muốn lên phác đồ 3D thì chị chỉ cần scan nữa thôi ạ.',
    keywords: ['có film', 'đã chụp', 'có xquang'],
  },
  {
    category: 'Tình huống xử lý',
    intent: 'ho_tro_xe',
    user_message: 'Tôi ở xa không tiện di chuyển',
    bot_response: 'Bên em có hỗ trợ đặt xe đưa đón miễn phí cho khách hàng ghé nha khoa bên em thăm khám nếu khách hàng không tiện di chuyển ạ.',
    keywords: ['xe đưa đón', 'di chuyển', 'đi lại'],
  },
  {
    category: 'Tình huống xử lý',
    intent: 'kh_di_oto',
    user_message: 'Tôi đi ô tô có chỗ gửi không?',
    bot_response: 'Địa chỉ gửi xe ôtô bên em ở SỐ 10 NAM QUỐC CANG, PHƯỜNG PHẠM NGŨ LÃO cách nha khoa bên em khoảng hơn 100m, mình gửi xe đi bộ lại 1 xíu là đến bên em ạ.',
    keywords: ['ô tô', 'gửi xe', 'đậu xe'],
  },
];

export const SEED_PHRASES_CSKH = [
  // ===== CHĂM SÓC KHÁCH HÀNG =====
  {
    category: 'Chăm sóc khách hàng',
    intent: 'cskh_chao',
    user_message: 'Tôi đang tìm hiểu niềng răng',
    bot_response: 'Chị ơi mình quan tâm đến niềng khay trong suốt, chị cần em hỗ trợ thông tin gì để chị tìm hiểu ạ?',
    keywords: ['tìm hiểu', 'quan tâm', 'thông tin'],
  },
  {
    category: 'Chăm sóc khách hàng',
    intent: 'cskh_follow_up',
    user_message: '(Khách không trả lời)',
    bot_response: 'Em thấy mình đang quan tâm đến niềng răng đã lâu, chị cần bên em cung cấp thêm thông tin gì để chị tiện tìm hiểu về niềng?',
    keywords: ['follow up', 'nhắc lại', 'không trả lời'],
  },
  {
    category: 'Chăm sóc khách hàng',
    intent: 'cskh_hoi_lich',
    user_message: '(Khách chưa đặt hẹn)',
    bot_response: 'Chị ơi mình đã sắp xếp được thời gian ngày nào ghé bên em thăm khám tiện cho chị chưa ạ?',
    keywords: ['sắp xếp', 'thời gian', 'chưa hẹn'],
  },
  {
    category: 'Chăm sóc khách hàng',
    intent: 'nhac_lich_hen',
    user_message: '(Nhắc lịch hẹn khách)',
    bot_response: 'Chị ơi mai mình có lịch hẹn thăm khám nha khoa bên em. Mai mình ghé thăm khám đúng giờ giúp em ạ. Vì phía sau khung giờ của mình có lịch của KH khác nên chị thông cảm cho phòng khám ạ. Chúc chị buổi chiều vui vẻ hẹn mai gặp chị ạ.',
    keywords: ['nhắc hẹn', 'ngày mai', 'lịch hẹn'],
  },
  {
    category: 'Chăm sóc khách hàng',
    intent: 'goi_y_tham_kham',
    user_message: 'Tôi muốn tìm hiểu thêm trước',
    bot_response: 'Mình muốn xem trước KẾT QUẢ 3D SAU NIỀNG để tiện tham khảo, tìm hiểu, so sánh với các nha khoa khác thì mình ghé bên em. Thăm khám tư vấn KHÔNG MẤT PHÍ. Không biết mình sắp xếp thời gian trong ngày tiện 30p ghé bên em không ạ?',
    keywords: ['tìm hiểu thêm', 'so sánh', 'chưa quyết định'],
  },
];

export const SEED_PHRASES_NHAKHOA = [
  // ===== THÔNG TIN NHA KHOA =====
  {
    category: 'Thông tin nha khoa',
    intent: 'dia_chi_hcm',
    user_message: 'Nha khoa ở đâu HCM?',
    bot_response: 'Trụ sở chính: 77C Bùi Thị Xuân, Phường Phạm Ngũ Lão, Quận 1, HCM. Nha khoa Wonder Dental.',
    keywords: ['địa chỉ', 'hcm', 'quận 1', 'ở đâu'],
  },
  {
    category: 'Thông tin nha khoa',
    intent: 'dia_chi_hanoi',
    user_message: 'Hà Nội ở đâu?',
    bot_response: 'Nha khoa Best Choice, 99 Giải Phóng, Hai Bà Trưng, HN. Hotline: 1900 86 86 99.',
    keywords: ['hà nội', 'hn', 'giải phóng'],
  },
  {
    category: 'Thông tin nha khoa',
    intent: 'dia_chi_danang',
    user_message: 'Đà Nẵng ở đâu?',
    bot_response: '134 Đ. Nguyễn Văn Linh, Vĩnh Trung, Hải Châu, Đà Nẵng. Nha Khoa Magic Dentist - Dr Wondersmile.',
    keywords: ['đà nẵng', 'miền trung'],
  },
  {
    category: 'Thông tin nha khoa',
    intent: 'dia_chi_tat_ca',
    user_message: 'Bên em có bao nhiêu chi nhánh?',
    bot_response: 'Trụ sở chính của niềng khay Dr.Wondersmile ở Quận 1 - HCM và HÀ NỘI. Cùng các chi nhánh nha khoa liên kết ở Biên Hòa - Đồng Nai, Hà Nội, Đà Nẵng, Dĩ An - Bình Dương, Đồng Xoài - Bình Phước, Vĩnh Long. Không biết mình ở đâu ạ?',
    keywords: ['chi nhánh', 'bao nhiêu', 'ở đâu có'],
  },
  {
    category: 'Thông tin nha khoa',
    intent: 'thoi_gian_lam_viec',
    user_message: 'Mấy giờ làm việc?',
    bot_response: 'THỜI GIAN LÀM VIỆC: 9:00 đến 19:00 (Tất cả các ngày trong tuần, kể cả T7 – CN).',
    keywords: ['giờ làm việc', 'mấy giờ', 'mở cửa', 'thời gian'],
  },
];
