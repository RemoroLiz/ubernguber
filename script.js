$(document).ready(function () {
  // Inisialisasi Select2
  $("#nama-barang").select2({
    placeholder: "Pilih atau cari barang...",
    allowClear: true,
    width: "100%",
    dropdownParent: $(".calculator-card"),
    language: {
      noResults: function () {
        return "Barang tidak ditemukan. Gunakan input manual.";
      },
      searching: function () {
        return "Mencari...";
      },
    },
  });

  // Variabel global
  let cokimValue = 0;
  let barangData = [];
  let keranjang = [];
  let keranjangIdCounter = 1;
  let calculationTimeout = null;

  // URL Google Sheets
  const csvUrl =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRI6Id2sC8U3gsRVhhOV-4esHxV7yx46yHOk5jIKGwLHcKM5Y8SpWC4-Kev6aNngeFsvGZ4-HyHj_KR/pub?output=csv";

  // ==================== FUNGSI UTILITAS ====================

  // Fungsi untuk menampilkan notifikasi
  function showNotification(message, type = "info") {
    // Hapus notifikasi sebelumnya
    $(".notification").remove();

    // Buat elemen notifikasi
    const icon =
      type === "success"
        ? "check-circle"
        : type === "error"
        ? "exclamation-circle"
        : type === "warning"
        ? "exclamation-triangle"
        : "info-circle";

    const notification = $(`
            <div class="notification ${type}">
                <i class="fas fa-${icon}"></i>
                <span>${message}</span>
            </div>
        `);

    // Tambahkan ke body
    $("body").append(notification);

    // Hapus otomatis setelah 5 detik
    setTimeout(() => {
      notification.fadeOut(300, function () {
        $(this).remove();
      });
    }, 5000);
  }

  // Fungsi untuk pembulatan ke atas ke kelipatan 500
  function ceilingTo500(value) {
    return Math.ceil(value / 500) * 500;
  }

  // Fungsi untuk menghitung berat efektif untuk perhitungan ongkos
  function getBeratOngkos(berat) {
    if (berat > 0 && berat < 1) {
      return 1;
    }
    return berat;
  }

  // ==================== FUNGSI LOAD DATA ====================

  // Fungsi untuk mengambil data dari Google Sheets
  async function loadDataFromGoogleSheets() {
    try {
      $("#data-loading").show();
      $("#cokim-value").text("Memuat...");
      $("#data-status").html(
        '<i class="fas fa-spinner fa-spin"></i> Memuat data...'
      );

      console.log("Mengambil data dari:", csvUrl);

      const response = await fetch(csvUrl);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const csvData = await response.text();
      const rows = csvData.split("\n").filter((row) => row.trim() !== "");

      console.log("Jumlah baris total:", rows.length);

      // Reset data
      barangData = [];
      cokimValue = 0;

      // ===== 1. CARI COKIM =====
      console.log("=== MENCARI COKIM ===");

      // Versi 1: Cari baris yang mengandung kata COKIM
      let cokimFound = false;
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i].toLowerCase();
        if (row.includes("cokim")) {
          // Coba extract angka dari baris
          const matches = row.match(/[\d.]+/g);
          if (matches && matches.length > 0) {
            cokimValue = parseFloat(matches[0]);
            cokimFound = true;
            console.log("✅ COKIM ditemukan via keyword:", cokimValue);
            break;
          }
        }
      }

      // Versi 2: Jika tidak ditemukan via keyword, coba di A3 (baris ke-3)
      if (!cokimFound && rows.length >= 3) {
        const rowA3 = rows[2];
        console.log("Baris A3 (indeks 2):", rowA3);

        // Coba parsing dengan berbagai delimiter
        const delimiters = [",", ";", "\t"];
        let cells = [];

        for (const delimiter of delimiters) {
          cells = rowA3.split(delimiter);
          if (cells.length > 1) break;
        }

        console.log("Cells A3 setelah parsing:", cells);

        if (cells.length > 0) {
          const cellA3 = cells[0].trim();
          // Extract angka dari cell
          const numberMatch = cellA3.match(/(\d+\.?\d*)/);
          if (numberMatch) {
            const nilai = parseFloat(numberMatch[1]);
            console.log("Nilai numerik di A3:", nilai);

            // Konversi jika nilai terlalu besar (mungkin harga dalam Rupiah)
            if (nilai > 1000000) {
              cokimValue = 107.5; // Default percentage
              console.log(
                "✅ COKIM (dikonversi dari harga besar):",
                cokimValue
              );
            } else if (nilai > 0) {
              cokimValue = nilai;
              console.log("✅ COKIM langsung dari A3:", cokimValue);
            }
          }
        }
      }

      // Versi 3: Default jika semua gagal
      if (cokimValue === 0) {
        cokimValue = 107.5;
        console.warn(
          "COKIM tidak ditemukan. Menggunakan nilai default:",
          cokimValue
        );
        showNotification(
          "COKIM tidak ditemukan di spreadsheet. Menggunakan nilai default.",
          "warning"
        );
      }

      // Update tampilan COKIM
      $("#cokim-value").text(cokimValue.toLocaleString("id-ID"));
      console.log("Nilai COKIM akhir:", cokimValue);

      // ===== 2. CARI DATA BARANG =====
      console.log("=== MENCARI DATA BARANG ===");

      // Cari baris header dengan pola yang lebih fleksibel
      let headerRowIndex = -1;
      const headerPatterns = [
        { kode: true, nama: true, harga: true },
        { kode: true, nama: true, jual: true },
        { code: true, name: true, price: true },
      ];

      for (let i = 0; i < Math.min(15, rows.length); i++) {
        const rowLower = rows[i].toLowerCase();

        // Cek berbagai pola header
        if (
          (rowLower.includes("kode") &&
            rowLower.includes("nama") &&
            rowLower.includes("harga")) ||
          (rowLower.includes("code") &&
            rowLower.includes("name") &&
            rowLower.includes("price")) ||
          (rowLower.includes("kode") &&
            rowLower.includes("nama") &&
            rowLower.includes("jual"))
        ) {
          headerRowIndex = i;
          console.log(`✅ Header ditemukan di baris ${i + 1}:`, rows[i]);
          break;
        }
      }

      // Fallback: asumsikan baris 3 adalah header jika tidak ditemukan
      if (headerRowIndex === -1 && rows.length > 3) {
        headerRowIndex = 2;
        console.log(
          "Header tidak ditemukan, menggunakan baris 3 sebagai header"
        );
      }

      // Parse data barang
      const startRow = headerRowIndex + 1;
      let barangCount = 0;

      for (let i = startRow; i < rows.length; i++) {
        if (barangCount >= 100) break; // Batasi maksimal 100 barang

        const row = rows[i].trim();
        if (!row) continue;

        // Coba berbagai delimiter
        let cells = [];
        const delimiters = [",", ";", "\t"];

        for (const delimiter of delimiters) {
          cells = row.split(delimiter).map((cell) => {
            // Hapus quotes dan spasi ekstra
            return cell.trim().replace(/^["']|["']$/g, "");
          });
          if (cells.length >= 3) break;
        }

        // Minimal butuh 3 kolom: kode, nama, harga
        if (cells.length < 3) {
          console.log(
            `Baris ${i + 1} di-skip (hanya ${cells.length} kolom):`,
            cells
          );
          continue;
        }

        // Tentukan indeks kolom (fleksibel)
        let kodeIndex = 0;
        let namaIndex = 1;
        let hargaIndex = 2;

        // Coba deteksi berdasarkan header
        if (headerRowIndex !== -1) {
          const headerCells = rows[headerRowIndex]
            .toLowerCase()
            .split(/[,;\t]/);
          for (let j = 0; j < headerCells.length; j++) {
            const headerCell = headerCells[j].trim();
            if (headerCell.includes("kode") || headerCell.includes("code"))
              kodeIndex = j;
            if (headerCell.includes("nama") || headerCell.includes("name"))
              namaIndex = j;
            if (
              headerCell.includes("harga") ||
              headerCell.includes("price") ||
              headerCell.includes("jual")
            )
              hargaIndex = j;
          }
        }

        // Parse data dengan indeks yang telah ditentukan
        const kodeText = cells[kodeIndex] || "";
        const nama = cells[namaIndex] || "";
        const hargaText = cells[hargaIndex] || "";

        // Parse kode
        const kodeMatch = kodeText.match(/\d+/);
        const kode = kodeMatch ? parseInt(kodeMatch[0]) : 0;

        // Parse harga (hapus karakter non-numeric)
        const cleanHargaText = hargaText.replace(/[^\d.]/g, "");
        const harga = parseFloat(cleanHargaText) || 0;

        // Validasi data
        if (
          kode > 0 &&
          nama.trim() !== "" &&
          !nama.toLowerCase().includes("kode") &&
          !nama.toLowerCase().includes("total")
        ) {
          barangData.push({
            kode: kode,
            nama: nama.trim(),
            harga: harga,
          });
          barangCount++;

          console.log(
            `✅ Barang ${barangCount}: ${nama} (Kode: ${kode}, Harga: ${harga.toLocaleString(
              "id-ID"
            )})`
          );
        }
      }

      console.log(`Total barang ditemukan: ${barangData.length}`);

      // Isi dropdown dengan data
      populateBarangDropdown();

      // Sembunyikan loading
      $("#data-loading").hide();
      $("#data-status").html(
        '<i class="fas fa-database"></i> Data dimuat dari Google Sheets'
      );

      // Tampilkan notifikasi sukses
      if (barangData.length > 0) {
        showNotification(
          `Data berhasil dimuat! COKIM: ${cokimValue}, ${barangData.length} barang ditemukan`,
          "success"
        );
      } else {
        showNotification(
          "Data berhasil dimuat tetapi tidak ada barang ditemukan. Silakan gunakan input manual.",
          "warning"
        );
      }
    } catch (error) {
      console.error("❌ Error loading data from Google Sheets:", error);

      // Fallback ke data contoh
      loadFallbackData();

      showNotification(
        "Gagal memuat data dari Google Sheets. Menggunakan data contoh.",
        "error"
      );
    }
  }

  // Fungsi untuk data fallback
  function loadFallbackData() {
    console.log("Menggunakan data fallback...");

    cokimValue = 107.5;
    barangData = [
      { kode: 101, nama: "Emas 24K", harga: 950000 },
      { kode: 102, nama: "Emas 22K", harga: 870000 },
      { kode: 103, nama: "Emas 20K", harga: 790000 },
      { kode: 104, nama: "Emas 18K", harga: 710000 },
      { kode: 105, nama: "Kalung Emas 24K", harga: 980000 },
      { kode: 106, nama: "Cincin Emas 22K", harga: 900000 },
      { kode: 107, nama: "Gelang Emas 20K", harga: 820000 },
      { kode: 108, nama: "Liontin Emas 18K", harga: 750000 },
      { kode: 109, nama: "Anting Emas 24K", harga: 970000 },
      { kode: 110, nama: "Gelang Tangan Emas 22K", harga: 890000 },
    ];

    $("#cokim-value").text(cokimValue.toLocaleString("id-ID"));
    $("#data-loading").hide();
    $("#data-status").html(
      '<i class="fas fa-database"></i> Data contoh digunakan'
    );

    populateBarangDropdown();
  }

  // Fungsi untuk mengisi dropdown barang
  function populateBarangDropdown() {
    $("#nama-barang")
      .empty()
      .append('<option value="">Pilih atau cari barang...</option>');

    if (barangData.length === 0) {
      $("#nama-barang").append(
        '<option value="" disabled>Data barang tidak tersedia</option>'
      );
      return;
    }

    // Urutkan barang berdasarkan nama
    barangData.sort((a, b) => a.nama.localeCompare(b.nama));

    barangData.forEach((barang) => {
      const hargaText =
        barang.harga > 0 ? ` - Rp ${barang.harga.toLocaleString("id-ID")}` : "";
      $("#nama-barang").append(
        `<option value="${barang.kode}" data-harga="${barang.harga}">
                    ${barang.nama} (Kode: ${barang.kode})${hargaText}
                </option>`
      );
    });

    // Refresh Select2
    $("#nama-barang").trigger("change.select2");
  }

  // ==================== FUNGSI KALKULATOR ====================

  // Fungsi untuk menghitung harga per gram berdasarkan kode
  function calculateHargaPerGram(kode) {
    if (!kode || isNaN(kode) || kode <= 0) return 0;

    // Cari di data barang
    const barang = barangData.find((item) => item.kode == kode);
    if (barang && barang.harga > 0) {
      return barang.harga;
    }

    // Jika tidak ditemukan, hitung berdasarkan formula
    const rawValue = kode * (cokimValue / 100);
    return ceilingTo500(rawValue);
  }

  // Fungsi untuk menghitung semua
  function calculateAll() {
    try {
      // Ambil nilai input
      const kode = parseInt($("#kode-barang").val()) || 0;
      const ongkos = parseFloat($("#ongkos").val()) || 0;
      const berat = parseFloat($("#berat").val()) || 0;

      // Validasi input
      if (kode < 0) {
        showNotification("Kode barang tidak boleh negatif", "error");
        return;
      }

      if (ongkos < 0) {
        $("#ongkos").val(Math.abs(ongkos));
        showNotification("Ongkos tidak boleh negatif", "warning");
        return;
      }

      if (berat <= 0) {
        showNotification("Berat harus lebih dari 0", "error");
        return;
      }

      if (berat < 0.01) {
        $("#berat").val("0.01");
        showNotification("Berat minimum adalah 0.01 gram", "info");
        return;
      }

      // Hitung harga per gram
      const hargaPerGram = calculateHargaPerGram(kode);
      $("#harga-pergram").val(hargaPerGram);

      // Update info harga
      const selectedBarang = barangData.find((item) => item.kode == kode);
      if (selectedBarang) {
        $("#harga-info").text(
          `Harga dari data spreadsheet: ${selectedBarang.nama}`
        );
      } else {
        $("#harga-info").text(
          `Harga dihitung: Kode ${kode} × (COKIM ${cokimValue} ÷ 100)`
        );
      }

      // Hitung harga barang (gunakan berat asli)
      const hargaBarang = ceilingTo500(hargaPerGram * berat);
      $("#harga-barang").text("IDR " + hargaBarang.toLocaleString("id-ID"));

      // Hitung berat untuk ongkos
      const beratUntukOngkos = getBeratOngkos(berat);

      // Tampilkan informasi berat ongkos jika berbeda
      const ongkosInfo = $("#ongkos-info");
      if (berat < 1 && berat > 0) {
        ongkosInfo
          .text(`Berat: ${berat.toFixed(2)}g → ${beratUntukOngkos}g`)
          .show();
      } else {
        ongkosInfo.hide();
      }

      // Hitung harga ongkos dengan berat yang sudah disesuaikan
      const hargaOngkos = ceilingTo500(ongkos * beratUntukOngkos);
      $("#harga-ongkos").text("IDR " + hargaOngkos.toLocaleString("id-ID"));

      // Hitung harga total
      const hargaTotal = hargaBarang + hargaOngkos;
      $("#harga-total").text("IDR " + hargaTotal.toLocaleString("id-ID"));

      // Aktifkan tombol tambah ke keranjang jika data valid
      if (hargaBarang > 0 && berat > 0) {
        $("#tambah-keranjang").prop("disabled", false);
      } else {
        $("#tambah-keranjang").prop("disabled", true);
      }
    } catch (error) {
      console.error("Error in calculation:", error);
      showNotification("Terjadi kesalahan dalam perhitungan", "error");
    }
  }

  // Fungsi untuk reset form
  function resetForm() {
    // Reset form kalkulator
    $("#nama-barang").val("").trigger("change.select2");
    $("#kode-barang").val("");
    $("#harga-pergram").val("");
    $("#ongkos").val("");
    $("#berat").val("");

    // Reset hasil perhitungan
    $("#harga-barang").text("IDR 0");
    $("#harga-ongkos").text("IDR 0");
    $("#harga-total").text("IDR 0");

    // Reset info
    $("#harga-info").text("Harga berdasarkan COKIM dan kode barang");
    $("#ongkos-info").hide();

    // Nonaktifkan tombol keranjang
    $("#tambah-keranjang").prop("disabled", true);

    // Sembunyikan input manual jika aktif
    $("#manual-input-container").hide();
    $("#manual-nama-barang").val("");
    $("#toggle-manual").html('<i class="fas fa-edit"></i> Input Manual');
  }

  // ==================== FUNGSI KERANJANG ====================

  // Fungsi untuk menambahkan item ke keranjang
  function tambahKeKeranjang() {
    try {
      // Ambil nilai dari form
      let namaBarang = $("#nama-barang option:selected").text();
      if (!namaBarang || namaBarang === "Pilih atau cari barang...") {
        namaBarang = $("#manual-nama-barang").val() || "Barang Manual";
      } else {
        // Hapus info harga dari teks jika ada
        namaBarang = namaBarang.split(" - IDR")[0].split(" - Rp")[0].trim();
      }

      const kodeBarang = parseInt($("#kode-barang").val()) || 0;
      const hargaPerGram = parseFloat($("#harga-pergram").val()) || 0;
      const berat = parseFloat($("#berat").val()) || 0;
      const ongkos = parseFloat($("#ongkos").val()) || 0;

      // Ambil nilai hasil perhitungan
      const hargaBarangText = $("#harga-barang")
        .text()
        .replace("IDR ", "")
        .replace("Rp ", "")
        .replace(/\./g, "")
        .replace(/,/g, "");
      const hargaOngkosText = $("#harga-ongkos")
        .text()
        .replace("IDR ", "")
        .replace("Rp ", "")
        .replace(/\./g, "")
        .replace(/,/g, "");
      const hargaTotalText = $("#harga-total")
        .text()
        .replace("IDR ", "")
        .replace("Rp ", "")
        .replace(/\./g, "")
        .replace(/,/g, "");

      const hargaBarang = parseFloat(hargaBarangText) || 0;
      const hargaOngkos = parseFloat(hargaOngkosText) || 0;
      const hargaTotal = parseFloat(hargaTotalText) || 0;

      // Validasi data
      if (hargaBarang <= 0) {
        showNotification(
          "Harap hitung harga terlebih dahulu sebelum menambahkan ke keranjang.",
          "error"
        );
        return false;
      }

      if (!namaBarang || namaBarang.trim() === "") {
        showNotification("Nama barang tidak boleh kosong", "error");
        return false;
      }

      // Buat item keranjang baru
      const itemKeranjang = {
        id: keranjangIdCounter++,
        nama: namaBarang,
        kode: kodeBarang,
        hargaPerGram: hargaPerGram,
        berat: berat,
        ongkosPerGram: ongkos,
        hargaBarang: hargaBarang,
        hargaOngkos: hargaOngkos,
        total: hargaTotal,
        tanggal: new Date().toLocaleString("id-ID"),
        beratOngkos: getBeratOngkos(berat),
      };

      // Tambahkan ke array keranjang
      keranjang.push(itemKeranjang);

      // Simpan ke localStorage
      simpanKeranjangKeLocalStorage();

      // Update tampilan keranjang
      updateTampilanKeranjang();

      // Reset form
      resetForm();

      // Tampilkan notifikasi sukses
      showNotification(
        `"${namaBarang}" berhasil ditambahkan ke keranjang!`,
        "success"
      );

      // Tampilkan section keranjang jika belum ditampilkan
      $("#keranjang-section").slideDown();

      return true;
    } catch (error) {
      console.error("Error menambahkan ke keranjang:", error);
      showNotification("Gagal menambahkan ke keranjang.", "error");
      return false;
    }
  }

  // Fungsi untuk menghapus item dari keranjang
  function hapusDariKeranjang(id) {
    // Cari item berdasarkan ID
    const item = keranjang.find((item) => item.id === id);
    if (!item) return;

    if (
      confirm(
        `Apakah Anda yakin ingin menghapus "${item.nama}" dari keranjang?`
      )
    ) {
      keranjang = keranjang.filter((item) => item.id !== id);

      // Simpan ke localStorage
      simpanKeranjangKeLocalStorage();

      // Update tampilan
      updateTampilanKeranjang();

      // Tampilkan notifikasi
      showNotification(`"${item.nama}" dihapus dari keranjang.`, "info");

      // Sembunyikan section keranjang jika kosong
      if (keranjang.length === 0) {
        $("#keranjang-section").slideUp();
      }
    }
  }

  // Fungsi untuk membuka modal edit
  function bukaModalEdit(id) {
    // Cari item berdasarkan ID
    const item = keranjang.find((item) => item.id === id);

    if (item) {
      // Isi form modal dengan data item
      $("#edit-id").val(item.id);
      $("#edit-nama").val(item.nama);
      $("#edit-kode").val(item.kode);
      $("#edit-harga-pergram").val(item.hargaPerGram);
      $("#edit-berat").val(item.berat);
      $("#edit-ongkos").val(item.ongkosPerGram);
      $("#edit-harga-barang").val(item.hargaBarang);
      $("#edit-harga-ongkos").val(item.hargaOngkos);
      $("#edit-total").val(item.total);

      // Tampilkan modal
      $("#modal-edit").fadeIn();
      $("body").css("overflow", "hidden");
    }
  }

  // Fungsi untuk menyimpan perubahan dari modal edit
  function simpanEditItem() {
    try {
      const id = parseInt($("#edit-id").val());
      if (!id) return;

      // Validasi input
      const berat = parseFloat($("#edit-berat").val());
      if (berat < 0.01) {
        showNotification("Berat minimum adalah 0.01 gram", "error");
        return;
      }

      // Cari item di keranjang
      const itemIndex = keranjang.findIndex((item) => item.id === id);
      if (itemIndex === -1) return;

      // Update data item
      keranjang[itemIndex] = {
        id: id,
        nama: $("#edit-nama").val().trim(),
        kode: parseInt($("#edit-kode").val()),
        hargaPerGram: parseFloat($("#edit-harga-pergram").val()),
        berat: berat,
        ongkosPerGram: parseFloat($("#edit-ongkos").val()),
        hargaBarang: parseFloat($("#edit-harga-barang").val()),
        hargaOngkos: parseFloat($("#edit-harga-ongkos").val()),
        total: parseFloat($("#edit-total").val()),
        tanggal: keranjang[itemIndex].tanggal,
        beratOngkos: getBeratOngkos(berat),
      };

      // Simpan ke localStorage
      simpanKeranjangKeLocalStorage();

      // Update tampilan keranjang
      updateTampilanKeranjang();

      // Tutup modal
      tutupModalEdit();

      // Tampilkan notifikasi
      showNotification("Item berhasil diperbarui!", "success");
    } catch (error) {
      console.error("Error menyimpan edit:", error);
      showNotification("Gagal menyimpan perubahan", "error");
    }
  }

  // Fungsi untuk menutup modal edit
  function tutupModalEdit() {
    $("#modal-edit").fadeOut();
    $("body").css("overflow", "auto");
    $("#form-edit")[0].reset();
  }

  // Fungsi untuk mengosongkan keranjang
  function kosongkanKeranjang() {
    if (keranjang.length === 0) {
      showNotification("Keranjang sudah kosong.", "info");
      return;
    }

    if (
      confirm(
        `Apakah Anda yakin ingin mengosongkan seluruh keranjang? (${keranjang.length} item akan dihapus)`
      )
    ) {
      keranjang = [];
      keranjangIdCounter = 1;

      // Hapus dari localStorage
      localStorage.removeItem("keranjangEmas");
      localStorage.removeItem("keranjangIdCounter");

      // Update tampilan
      updateTampilanKeranjang();

      // Sembunyikan section keranjang
      $("#keranjang-section").slideUp();

      showNotification("Keranjang berhasil dikosongkan.", "success");
    }
  }

  // Fungsi untuk update tampilan keranjang
  function updateTampilanKeranjang() {
    const tbody = $("#keranjang-body");

    // Kosongkan tabel
    tbody.empty();

    if (keranjang.length === 0) {
      // Tampilkan pesan keranjang kosong
      tbody.html(`
                <tr class="empty-keranjang">
                    <td colspan="9">
                        <i class="fas fa-shopping-cart"></i>
                        <p>Keranjang belanja kosong</p>
                        <small>Tambahkan item dari form kalkulator di atas</small>
                    </td>
                </tr>
            `);

      // Update counter
      $("#keranjang-count").text("(0)");

      // Update total
      updateTotalKeranjang();

      return;
    }

    // Isi tabel dengan data keranjang
    keranjang.forEach((item, index) => {
      const row = `
                <tr class="new-item">
                    <td>${index + 1}</td>
                    <td>${item.nama}</td>
                    <td>${item.kode}</td>
                    <td>IDR ${item.hargaPerGram.toLocaleString("id-ID")}</td>
                    <td>${item.berat.toFixed(2)}g</td>
                    <td>IDR ${item.hargaBarang.toLocaleString("id-ID")}</td>
                    <td>IDR ${item.hargaOngkos.toLocaleString("id-ID")}</td>
                    <td>IDR ${item.total.toLocaleString("id-ID")}</td>
                    <td>
                        <div class="btn-aksi">
                            <button class="btn-edit" data-id="${
                              item.id
                            }" title="Edit" type="button">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-hapus" data-id="${
                              item.id
                            }" title="Hapus" type="button">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;

      tbody.append(row);
    });

    // Update counter
    $("#keranjang-count").text(`(${keranjang.length})`);

    // Update total
    updateTotalKeranjang();
  }

  // Fungsi untuk update total keranjang
  function updateTotalKeranjang() {
    // Hitung total
    const totalHargaBarang = keranjang.reduce(
      (sum, item) => sum + item.hargaBarang,
      0
    );
    const totalOngkos = keranjang.reduce(
      (sum, item) => sum + item.hargaOngkos,
      0
    );
    const totalKeseluruhan = keranjang.reduce(
      (sum, item) => sum + item.total,
      0
    );

    // Update tampilan total
    $("#total-harga-barang").text(
      "IDR " + totalHargaBarang.toLocaleString("id-ID")
    );
    $("#total-ongkos").text("IDR " + totalOngkos.toLocaleString("id-ID"));
    $("#total-keseluruhan").text(
      "IDR " + totalKeseluruhan.toLocaleString("id-ID")
    );
  }

  // Fungsi untuk menyimpan keranjang ke localStorage
  function simpanKeranjangKeLocalStorage() {
    try {
      localStorage.setItem("keranjangEmas", JSON.stringify(keranjang));
      localStorage.setItem("keranjangIdCounter", keranjangIdCounter.toString());
    } catch (error) {
      console.error("Error menyimpan ke localStorage:", error);
      showNotification("Gagal menyimpan ke penyimpanan lokal", "error");
    }
  }

  // Fungsi untuk memuat keranjang dari localStorage
  function muatKeranjangDariLocalStorage() {
    try {
      const savedKeranjang = localStorage.getItem("keranjangEmas");
      const savedIdCounter = localStorage.getItem("keranjangIdCounter");

      if (savedKeranjang) {
        keranjang = JSON.parse(savedKeranjang);
        keranjangIdCounter = savedIdCounter
          ? parseInt(savedIdCounter)
          : Math.max(...keranjang.map((item) => item.id), 0) + 1;

        // Update tampilan keranjang jika ada item
        if (keranjang.length > 0) {
          updateTampilanKeranjang();
          $("#keranjang-section").show();
        }

        console.log(
          `Keranjang dimuat dari localStorage: ${keranjang.length} item`
        );
      }
    } catch (error) {
      console.error("Error memuat dari localStorage:", error);
      keranjang = [];
      keranjangIdCounter = 1;
    }
  }

  // Fungsi untuk menyimpan keranjang ke server (AJAX)
  function simpanKeranjangKeServer() {
    if (keranjang.length === 0) {
      showNotification(
        "Keranjang kosong. Tidak ada data untuk disimpan.",
        "warning"
      );
      return;
    }

    // Simulasi AJAX request ke server
    showNotification("Menyimpan keranjang ke server...", "info");

    // Simpan tombol asli
    const originalButton = $("#simpan-keranjang").html();
    $("#simpan-keranjang")
      .html('<i class="fas fa-spinner fa-spin"></i> Menyimpan...')
      .prop("disabled", true);

    // Simulasi delay server
    setTimeout(() => {
      // Dalam implementasi nyata, ini akan menggunakan $.ajax() atau fetch()
      console.log("Data keranjang untuk dikirim ke server:", keranjang);

      // Simulasi response sukses
      showNotification(
        `Keranjang berhasil disimpan ke server! (${keranjang.length} item)`,
        "success"
      );

      // Kembalikan tombol ke state semula
      $("#simpan-keranjang").html(originalButton).prop("disabled", false);
    }, 1500);
  }

  // ==================== EVENT HANDLERS ====================

  // Event handler untuk dropdown barang
  $("#nama-barang").on("change", function () {
    const selectedOption = $(this).find(":selected");
    const kode = selectedOption.val();
    const harga = selectedOption.data("harga");

    if (kode) {
      // Isi kode barang secara otomatis
      $("#kode-barang").val(kode);

      // Jika barang dipilih dari dropdown, harga per gram diambil dari data
      if (harga && harga > 0) {
        $("#harga-pergram").val(harga);
      }

      // Sembunyikan input manual jika aktif
      $("#manual-input-container").hide();
      $("#manual-nama-barang").val("");
      $("#toggle-manual").html('<i class="fas fa-edit"></i> Input Manual');
    }

    // Hitung ulang setelah delay
    clearTimeout(calculationTimeout);
    calculationTimeout = setTimeout(calculateAll, 300);
  });

  // Event handler untuk tombol toggle input manual
  $("#toggle-manual").click(function () {
    const manualContainer = $("#manual-input-container");

    if (manualContainer.is(":visible")) {
      manualContainer.hide();
      $("#manual-nama-barang").val("");
      $("#toggle-manual").html('<i class="fas fa-edit"></i> Input Manual');
      $("#nama-barang").val("").trigger("change.select2");
    } else {
      manualContainer.show();
      $("#toggle-manual").html('<i class="fas fa-list"></i> Pilih dari Daftar');
      $("#nama-barang").val("").trigger("change.select2");
      $("#kode-barang").val("");
      $("#harga-pergram").val("");
    }
  });

  // Event handler untuk input manual
  $("#manual-nama-barang").on("input", function () {
    if ($(this).val().trim() !== "") {
      $("#kode-barang").val("");
      $("#harga-pergram").val("");

      // Trigger calculation
      clearTimeout(calculationTimeout);
      calculationTimeout = setTimeout(calculateAll, 300);
    }
  });

  // Event handler untuk input kode, ongkos, dan berat
  $("#kode-barang, #ongkos, #berat").on("input", function () {
    clearTimeout(calculationTimeout);
    calculationTimeout = setTimeout(calculateAll, 500);
  });

  // Event handler untuk tombol hitung
  $("#hitung").click(function () {
    calculateAll();
  });

  // Event handler untuk tombol tambah ke keranjang
  $("#tambah-keranjang").click(function () {
    tambahKeKeranjang();
  });

  // Event handler untuk tombol reset
  $("#reset").click(function () {
    resetForm();
    showNotification("Form telah direset", "info");
  });

  // Event handler untuk tombol kosongkan keranjang
  $("#kosongkan-keranjang").click(function () {
    kosongkanKeranjang();
  });

  // Event handler untuk tombol simpan keranjang
  $("#simpan-keranjang").click(function () {
    simpanKeranjangKeServer();
  });

  // Event handler untuk tombol refresh data
  $("#refresh-data").click(function () {
    const originalButton = $(this).html();
    $(this)
      .html('<i class="fas fa-spinner fa-spin"></i> Memuat ulang...')
      .prop("disabled", true);

    loadDataFromGoogleSheets().finally(() => {
      $(this).html(originalButton).prop("disabled", false);
    });
  });

  // Event handler untuk tombol edit dan hapus di keranjang (delegasi event)
  $(document).on("click", ".btn-edit", function () {
    const id = $(this).data("id");
    if (id) {
      bukaModalEdit(id);
    }
  });

  $(document).on("click", ".btn-hapus", function () {
    const id = $(this).data("id");
    if (id) {
      hapusDariKeranjang(id);
    }
  });

  // Event handler untuk modal edit
  $(document).on("click", ".modal-close", function () {
    tutupModalEdit();
  });

  $("#btn-save-edit").click(function () {
    simpanEditItem();
  });

  // Tutup modal saat klik di luar konten modal
  $(document).on("click", function (event) {
    if ($(event.target).is("#modal-edit")) {
      tutupModalEdit();
    }
  });

  // Tutup modal dengan ESC key
  $(document).on("keydown", function (event) {
    if (event.key === "Escape" && $("#modal-edit").is(":visible")) {
      tutupModalEdit();
    }
  });

  // Validasi input: tidak boleh negatif
  $('input[type="number"]').on("input", function () {
    const value = parseFloat($(this).val());
    if (value < 0) {
      $(this).val(Math.abs(value));
    }
  });

  // Validasi berat: minimum 0.01
  $("#berat").on("blur", function () {
    const value = parseFloat($(this).val());
    if (value < 0.01 && value !== 0) {
      $(this).val("0.01");
      showNotification("Berat minimum adalah 0.01 gram", "info");
      calculateAll();
    }
  });

  // ==================== INISIALISASI ====================

  // Nonaktifkan tombol keranjang awal
  $("#tambah-keranjang").prop("disabled", true);

  // Kosongkan input ongkos dan berat
  $("#ongkos").val("");
  $("#berat").val("");

  // Muat data saat halaman dimuat
  loadDataFromGoogleSheets();

  // Muat keranjang dari localStorage
  muatKeranjangDariLocalStorage();

  // Tambahkan class untuk touch devices
  if ("ontouchstart" in window || navigator.maxTouchPoints) {
    $("body").addClass("touch-device");
  }

  // Handle orientation change
  let resizeTimer;
  $(window).on("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      // Refresh Select2 pada orientation change
      if ($("#nama-barang").hasClass("select2-hidden-accessible")) {
        $("#nama-barang").select2("destroy");
        $("#nama-barang").select2({
          placeholder: "Pilih atau cari barang...",
          allowClear: true,
          width: "100%",
          dropdownParent: $(".calculator-card"),
          language: {
            noResults: function () {
              return "Barang tidak ditemukan. Gunakan input manual.";
            },
            searching: function () {
              return "Mencari...";
            },
          },
        });
      }
    }, 250);
  });
});
