(function ($) {

  "use strict";


  // init Chocolat light box
  var initChocolat = function () {
    Chocolat(document.querySelectorAll('.image-link'), {
      imageSize: 'contain',
      loop: true,
    })
  }


  $(document).ready(function () {


    /* Demo purposes only */
    $(".hover").mouseleave(
      function () {
        $(this).removeClass("hover");
      }
    );

    var swiper = new Swiper(".testimonial-swiper", {
      slidesPerView: 2,
      spaceBetween: 40,
      pagination: {
        el: ".swiper-pagination",
      },
      breakpoints: {

        390: {
          slidesPerView: 1,
          spaceBetween: 20,
        },

        450: {
          slidesPerView: 1,
          spaceBetween: 20,
        },

        640: {
          slidesPerView: 1,
          spaceBetween: 20,
        },

        768: {
          slidesPerView: 2,
          spaceBetween: 30,
        },
        1024: {
          slidesPerView: 2,
          spaceBetween: 30,
        },
      }


    });


    // Animate on Scroll
    AOS.init({
      duration: 600,
      once: true,
    })



    window.addEventListener("load", (event) => {
      //isotope
      $('.isotope-container').isotope({
        // options
        itemSelector: '.item',
        layoutMode: 'masonry'
      });



      // Initialize Isotope
      var $container = $('.isotope-container').isotope({
        // options
        itemSelector: '.item',
        layoutMode: 'masonry'
      });

      $(document).ready(function () {
        //active button
        $('.filter-button').click(function () {
          $('.filter-button').removeClass('active');
          $(this).addClass('active');
        });
      });

      // Filter items on button click
      $('.filter-button').click(function () {
        var filterValue = $(this).attr('data-filter');
        if (filterValue === '*') {
          // Show all items
          $container.isotope({ filter: '*' });
        } else {
          // Show filtered items
          $container.isotope({ filter: filterValue });
        }
      });

    });


    initChocolat();


  });



})(jQuery);