export const publicMaskAndCepScript = `
(function () {
  function onlyNumbers(value) {
    return String(value || '').replace(/\\D/g, '');
  }

  function formatCep(value) {
    return onlyNumbers(value).slice(0, 8).replace(/^(\\d{5})(\\d)/, '$1-$2');
  }

  function formatPhone(value) {
    var n = onlyNumbers(value).slice(0, 11);
    if (n.length <= 10) {
      return n.replace(/^(\\d{2})(\\d)/, '($1) $2').replace(/(\\d{4})(\\d)/, '$1-$2');
    }
    return n.replace(/^(\\d{2})(\\d)/, '($1) $2').replace(/(\\d{5})(\\d)/, '$1-$2');
  }

  function formatCpfCnpj(value) {
    var n = onlyNumbers(value).slice(0, 14);
    if (n.length <= 11) {
      return n
        .replace(/(\\d{3})(\\d)/, '$1.$2')
        .replace(/(\\d{3})(\\d)/, '$1.$2')
        .replace(/(\\d{3})(\\d{1,2})$/, '$1-$2');
    }
    return n
      .replace(/^(\\d{2})(\\d)/, '$1.$2')
      .replace(/^(\\d{2})\\.(\\d{3})(\\d)/, '$1.$2.$3')
      .replace(/\\.(\\d{3})(\\d)/, '.$1/$2')
      .replace(/(\\d{4})(\\d)/, '$1-$2');
  }

  function setField(names, value) {
    names.forEach(function (name) {
      var input = document.querySelector('[name="' + name + '"]');
      if (!input || !value) return;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function fillAddress(data) {
    setField(['rua', 'logradouro'], data.logradouro || '');
    setField(['bairro'], data.bairro || '');
    setField(['cidade'], data.localidade || '');
    setField(['estado'], data.uf || '');
  }

  function syncBrandSelect(categorySelect) {
    if (!categorySelect || categorySelect.name !== 'categoriaId') return;
    var form = categorySelect.closest('form') || document;
    var brandSelect = form.querySelector('select[name="marcaId"]');
    if (!brandSelect) return;

    var categoryId = String(categorySelect.value || '');
    var options = brandSelect.querySelectorAll('option[data-categoria-id]');
    var hasVisibleSelected = false;

    options.forEach(function (option) {
      var visible = categoryId && option.getAttribute('data-categoria-id') === categoryId;
      if (visible && option.selected) hasVisibleSelected = true;
    });

    if (!hasVisibleSelected) brandSelect.value = '';
  }

  function syncWarranty(radio) {
    if (!radio || radio.name !== 'garantia') return;
    var form = radio.closest('form') || document;
    var fields = form.querySelector('[data-garantia-campos]');
    if (!fields) return;
    var selected = form.querySelector('input[name="garantia"]:checked');
    fields.classList.toggle('is-hidden', !selected || selected.value !== 'SIM');
  }

  var lastCep = '';
  var cepTimer = null;

  function lookupCep(input) {
    var cep = onlyNumbers(input && input.value);
    if (cep.length !== 8 || cep === lastCep) return;
    lastCep = cep;
    clearTimeout(cepTimer);
    cepTimer = setTimeout(function () {
      fetch('https://viacep.com.br/ws/' + cep + '/json/')
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (data) {
          if (data && !data.erro) fillAddress(data);
        })
        .catch(function () {});
    }, 350);
  }

  function applyMask(input) {
    if (!input || !input.name) return;
    if (input.name === 'whatsapp') input.value = formatPhone(input.value);
    if (input.name === 'cpfCnpj') input.value = formatCpfCnpj(input.value);
    if (input.name === 'cep') input.value = formatCep(input.value);
    if (input.name === 'cep') lookupCep(input);
  }

  document.addEventListener('input', function (event) {
    applyMask(event.target);
    syncBrandSelect(event.target);
    syncWarranty(event.target);
  }, true);

  document.addEventListener('change', function (event) {
    syncBrandSelect(event.target);
    syncWarranty(event.target);
  }, true);

  document.addEventListener('blur', function (event) {
    applyMask(event.target);
  }, true);

  function initBrandSelects() {
    document.querySelectorAll('input[name="garantia"]').forEach(syncWarranty);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBrandSelects);
  } else {
    initBrandSelects();
  }
})();
`
